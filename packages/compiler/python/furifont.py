#!/usr/bin/env python3
"""Draw planned ruby glyphs into a base font and compile the planned rules.

This script makes no decision about readings. Everything it draws and every
rule it compiles comes from a plan written by @furifont/core; it only does
geometry and font-file plumbing.

  furifont.py info <font>
  furifont.py build <plan.json> <base-font> <out.otf> [--woff2 out.woff2] [--names names.json]

Progress goes to stderr as JSON lines, the result to stdout as JSON.
"""

import argparse
import io
import json
import math
import sys

from fontTools import subset as ft_subset
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont, getTableClass
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

MAX_GLYPHS = 65535
RIBBI = {'Regular', 'Bold', 'Italic', 'Bold Italic'}


class PlanError(Exception):
    pass


def progress(step, done=None, total=None):
    print(json.dumps({'step': step, 'done': done, 'total': total}), file=sys.stderr, flush=True)


def logical_name(cp):
    return f'u{cp:X}' if cp > 0xFFFF else f'uni{cp:04X}'


def style_of(font):
    name = font['name']
    return name.getDebugName(17) or name.getDebugName(2) or 'Regular'


def em_box(font):
    """Bottom and top of the ideographic em box, which ruby sits on."""
    upm = font['head'].unitsPerEm
    base = font.get('BASE')
    axis = base and base.table.HorizAxis
    if axis and axis.BaseTagList and 'ideo' in axis.BaseTagList.BaselineTag:
        index = axis.BaseTagList.BaselineTag.index('ideo')
        records = {r.BaseScriptTag: r for r in axis.BaseScriptList.BaseScriptRecord}
        record = records.get('hani') or records.get('kana') or records.get('DFLT')
        if record and record.BaseScript.BaseValues:
            bottom = record.BaseScript.BaseValues.BaseCoord[index].Coordinate
            return bottom, bottom + upm
    os2 = font['OS/2']
    if os2.sTypoAscender - os2.sTypoDescender == upm:
        return os2.sTypoDescender, os2.sTypoAscender
    return -0.12 * upm, 0.88 * upm


class Outlines:
    """Adds glyphs to CID-keyed CFF, name-keyed CFF or TrueType outlines."""

    def __init__(self, font):
        self.font = font
        self.order = list(font.getGlyphOrder())
        if 'CFF ' in font:
            self.cff = font['CFF '].cff
            self.top = self.cff.topDictIndex[0]
            self.cid = hasattr(self.top, 'ROS')
            if self.cid:
                # Subset CID fonts keep their original CIDs: reuse the gaps, CIDs are 16-bit.
                used = {int(n[3:]) for n in self.order if n.startswith('cid')}
                self.free_cids = (cid for cid in range(1, 65536) if cid not in used)
                self.max_cid = max(used)
        elif 'glyf' in font:
            self.cff = None
        else:
            raise PlanError('only CFF and TrueType base fonts are supported (no CFF2 variable fonts)')

    def new_name(self, logical):
        if self.cff and self.cid:
            cid = next(self.free_cids)
            self.max_cid = max(self.max_cid, cid)
            return f'cid{cid:05d}'
        if logical in self.order:
            raise PlanError(f'the base font already has a glyph named {logical}')
        return logical

    def add(self, logical, recording, width, like):
        name = self.new_name(logical)
        if self.cff:
            pen = T2CharStringPen(width, None)
            recording.replay(pen)
            if self.cid:
                fd = self.top.FDSelect[self.order.index(like)] if like else 0
                private = self.top.FDArray[fd].Private
            else:
                private = self.top.Private
            charstring = pen.getCharString(private=private, globalSubrs=self.cff.GlobalSubrs)
            strings = self.top.CharStrings
            strings.charStringsIndex.append(charstring)
            strings.charStrings[name] = len(strings.charStringsIndex) - 1
            self.top.charset.append(name)
            if self.cid:
                self.top.FDSelect.gidArray.append(fd)
        else:
            pen = TTGlyphPen(None)
            recording.replay(pen)
            self.font['glyf'][name] = pen.glyph()
        self.order.append(name)
        bounds = BoundsPen(None)
        recording.replay(bounds)
        x_min, _, _, y_max = bounds.bounds or (0, 0, 0, 0)
        self.font['hmtx'][name] = (round(width), round(x_min))
        if 'vmtx' in self.font:
            origin = self.font['VORG'].defaultVertOriginY if 'VORG' in self.font else self.font['hhea'].ascent
            self.font['vmtx'][name] = (self.font['head'].unitsPerEm if width else 0, round(origin - y_max))
        return name

    def finish(self):
        self.font.setGlyphOrder(self.order)
        if self.cff and self.cid:
            self.top.CIDCount = max(self.top.CIDCount, self.max_cid + 1)


def draw_glyph(spec, font, glyph_set, cmap, metrics, em):
    """Bases side by side, each ruby centred over its span: squeezed to fit, then overhanging."""
    upm = font['head'].unitsPerEm
    hmtx = font['hmtx']
    recording = DecomposingRecordingPen(glyph_set)
    stops = [0]
    for cp in spec['bases']:
        glyph = cmap[cp]
        glyph_set[glyph].draw(TransformPen(recording, (1, 0, 0, 1, stops[-1], 0)))
        stops.append(stops[-1] + hmtx[glyph][0])
    scale = metrics['rubyScale']
    bottom = em[1] + metrics['rubyGap'] * upm
    for ruby in spec['ruby']:
        glyphs = []
        for char in ruby['text']:
            if ord(char) not in cmap:
                raise PlanError(f'the base font has no glyph for ruby character {char!r}')
            glyphs.append(cmap[ord(char)])
        natural = sum(hmtx[g][0] for g in glyphs) * scale
        span = stops[ruby['end']] - stops[ruby['start']]
        squeeze = 1 if natural <= span else max(span / natural, metrics['compressionFloor'])
        squeeze = min(squeeze, metrics['maxRubyWidth'] * upm / natural)
        x = stops[ruby['start']] + (span - natural * squeeze) / 2
        for g in glyphs:
            transform = (scale * squeeze, 0, 0, scale, x, bottom - em[0] * scale)
            glyph_set[g].draw(TransformPen(recording, transform))
            x += hmtx[g][0] * scale * squeeze
    return recording, stops[-1]


def add_variants(font, outlines, variants, cmap):
    """Empty glyphs for base + selector sequences, mapped in cmap format 14; the rules replace them."""
    names = {}
    hmtx = font['hmtx']
    for v in variants:
        base = cmap[v['base']]
        names[v['name']] = outlines.add(v['name'], DecomposingRecordingPen(None), hmtx[base][0], base)
    table = next((t for t in font['cmap'].tables if t.format == 14), None)
    if table is None:
        table = CmapSubtable.newSubtable(14)
        table.platformID, table.platEncID, table.language = 0, 5, 0xFF
        table.cmap, table.uvsDict = {}, {}
        font['cmap'].tables.append(table)
    for v in variants:
        table.uvsDict.setdefault(v['selector'], []).append((v['base'], names[v['name']]))
    return names


def merge_gsub(font, ours):
    """Append our lookups and features to the base GSUB, registered in every script and language."""
    if 'GSUB' not in font:
        font['GSUB'] = ours
        return
    base = font['GSUB'].table
    table = ours.table
    offset = len(base.LookupList.Lookup)
    for lookup in table.LookupList.Lookup:
        for sub in lookup.SubTable:
            sub = getattr(sub, 'ExtSubTable', sub)
            records = list(getattr(sub, 'SubstLookupRecord', None) or [])
            for rule_set in (getattr(sub, 'ChainSubRuleSet', None) or []) + (getattr(sub, 'ChainSubClassSet', None) or []):
                for rule in (getattr(rule_set, 'ChainSubRule', None) or getattr(rule_set, 'ChainSubClassRule', None) or []) if rule_set else []:
                    records += rule.SubstLookupRecord
            for record in records:
                record.LookupListIndex += offset
        base.LookupList.Lookup.append(lookup)
    base.LookupList.LookupCount = len(base.LookupList.Lookup)

    features = base.FeatureList.FeatureRecord
    added = []
    for record in table.FeatureList.FeatureRecord:
        lookups = [i + offset for i in record.Feature.LookupListIndex]
        # Shapers use one record per tag in a language system: extend the font's own.
        existing = [r for r in features if r.FeatureTag == record.FeatureTag]
        for r in existing:
            r.Feature.LookupListIndex = sorted(r.Feature.LookupListIndex + lookups)
            r.Feature.LookupCount = len(r.Feature.LookupListIndex)
        if not existing:
            record.Feature.LookupListIndex = lookups
            features.append(record)
            added.append(record)
    # Feature records must stay sorted by tag; remap every language system to the new order.
    order = sorted(range(len(features)), key=lambda i: (features[i].FeatureTag, i))
    remap = {old: new for new, old in enumerate(order)}
    base.FeatureList.FeatureRecord = [features[i] for i in order]
    base.FeatureList.FeatureCount = len(features)
    ours_indices = [remap[features.index(r)] for r in added]
    for script in base.ScriptList.ScriptRecord:
        systems = [script.Script.DefaultLangSys] + [r.LangSys for r in script.Script.LangSysRecord]
        for system in filter(None, systems):
            system.FeatureIndex = sorted({remap[i] for i in system.FeatureIndex} | set(ours_indices))
            system.FeatureCount = len(system.FeatureIndex)


def compile_features(font, fea, logical_order):
    """Compile against glyph names derived from codepoints, then bind to the real glyph IDs."""
    stub = TTFont()
    stub.setGlyphOrder(logical_order)
    addOpenTypeFeaturesFromString(stub, fea, tables=['GSUB'])
    data = stub['GSUB'].compile(stub)
    ours = getTableClass('GSUB')()
    ours.decompile(data, font)
    merge_gsub(font, ours)


def set_names(font, family, description):
    style = style_of(font)
    ribbi = style in RIBBI
    full = f'{family} {style}'
    ps = f"{family.replace(' ', '')}-{style.replace(' ', '')}"
    version = font['name'].getDebugName(5) or 'Version 1.000'
    name = font['name']
    name.names = [n for n in name.names if n.nameID not in (1, 2, 3, 4, 6, 10, 16, 17)]
    entries = {
        1: family if ribbi else full,
        2: style if ribbi else 'Regular',
        3: f'{version.split(";")[0].removeprefix("Version ")};{ps}',
        4: full,
        6: ps,
        10: description,
    }
    if not ribbi:
        entries.update({16: family, 17: style})
    for name_id, value in entries.items():
        name.setName(value, name_id, 3, 1, 0x409)
        name.setName(value, name_id, 1, 0, 0)
    if 'CFF ' in font:
        cff = font['CFF '].cff
        old = cff.fontNames[0]
        cff.fontNames[0] = ps
        top = cff.topDictIndex[0]
        top.FullName, top.FamilyName = full, family
        for fd in getattr(top, 'FDArray', []):
            if hasattr(fd, 'FontName'):
                fd.FontName = fd.FontName.replace(old, ps)


def raise_ascender(font, metrics, em):
    upm = font['head'].unitsPerEm
    top = math.ceil(em[1] + (metrics['rubyGap'] + metrics['rubyScale']) * upm)
    font['hhea'].ascent = max(font['hhea'].ascent, top)
    font['OS/2'].usWinAscent = max(font['OS/2'].usWinAscent, top)


def check_shaping(data, smoke, logical_order):
    import uharfbuzz as hb
    face = hb.Face(hb.Blob(data))
    hb_font = hb.Font(face)
    for check in smoke:
        buf = hb.Buffer()
        buf.add_str(check['text'])
        buf.guess_segment_properties()
        hb.shape(hb_font, buf, {})
        got = [logical_order[info.codepoint] for info in buf.glyph_infos]
        if got != check['glyphs']:
            raise PlanError(f"{check['text']} shaped to {got}, expected {check['glyphs']}")


def load_base(path, plan):
    font = TTFont(path)
    if plan.get('subset') is not None:
        options = ft_subset.Options()
        options.layout_features = ['*']
        options.name_IDs = ['*']
        options.name_languages = ['*']
        options.notdef_outline = True
        subsetter = ft_subset.Subsetter(options)
        subsetter.populate(unicodes=plan['subset'] + plan['codepoints'])
        subsetter.subset(font)
    return font


def build(plan, base_path, out_path, woff2_path=None, names_path=None):
    progress('load')
    font = load_base(base_path, plan)
    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    added = len(plan['glyphs']) + len(plan['variants'])
    if len(font.getGlyphOrder()) + added > MAX_GLYPHS:
        raise PlanError(f"{len(font.getGlyphOrder())} base glyphs plus {added} new ones exceed {MAX_GLYPHS}: lower nfMax")

    logical = {}
    for cp in plan['codepoints']:
        if cp not in cmap:
            raise PlanError(f'the base font has no glyph for U+{cp:04X}')
        logical.setdefault(cmap[cp], logical_name(cp))
    aliases = {logical_name(cp): logical[cmap[cp]] for cp in plan['codepoints'] if logical[cmap[cp]] != logical_name(cp)}

    em = em_box(font)
    outlines = Outlines(font)
    real = {}
    total = len(plan['glyphs'])
    for i, spec in enumerate(plan['glyphs']):
        if i % 500 == 0:
            progress('draw', i, total)
        recording, width = draw_glyph(spec, font, glyph_set, cmap, plan['metrics'], em)
        real[spec['name']] = outlines.add(spec['name'], recording, width, cmap[spec['bases'][0]])
    progress('draw', total, total)
    real.update(add_variants(font, outlines, plan['variants'], cmap))
    outlines.finish()

    by_real = {v: k for k, v in real.items()}
    logical_order = [by_real.get(g) or logical.get(g) or g for g in font.getGlyphOrder()]

    progress('features')
    fea = plan['fea']
    if aliases:
        import re
        # Whole base names only: ruby glyph names like uni5DE5.rb.1 keep theirs.
        fea = re.sub(r'(?<![\w.])u(?:ni)?[0-9A-F]{4,6}(?![\w.])', lambda m: aliases.get(m.group(0), m.group(0)), fea)
    compile_features(font, fea, logical_order)

    set_names(font, plan['names']['family'], plan['names']['description'])
    raise_ascender(font, plan['metrics'], em)

    progress('save')
    buffer = io.BytesIO()
    font.save(buffer)
    data = buffer.getvalue()
    check_shaping(data, plan['smoke'], logical_order)
    with open(out_path, 'wb') as f:
        f.write(data)
    if woff2_path:
        progress('woff2')
        web = TTFont(io.BytesIO(data))
        web.flavor = 'woff2'
        web.save(woff2_path)
    if names_path:
        with open(names_path, 'w') as f:
            json.dump(logical_order, f)
    return {'glyphCount': len(logical_order), 'family': plan['names']['family'], 'style': style_of(font)}


def info(path):
    font = TTFont(path, lazy=True)
    return {
        'codepoints': sorted(font.getBestCmap()),
        'family': font['name'].getDebugName(16) or font['name'].getDebugName(1),
        'style': style_of(font),
        'unitsPerEm': font['head'].unitsPerEm,
        'glyphCount': len(font.getGlyphOrder()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)
    info_cmd = commands.add_parser('info')
    info_cmd.add_argument('font')
    build_cmd = commands.add_parser('build')
    build_cmd.add_argument('plan')
    build_cmd.add_argument('base')
    build_cmd.add_argument('out')
    build_cmd.add_argument('--woff2')
    build_cmd.add_argument('--names')
    args = parser.parse_args()
    try:
        if args.command == 'info':
            result = info(args.font)
        else:
            with open(args.plan, encoding='utf-8') as f:
                plan = json.load(f)
            result = build(plan, args.base, args.out, args.woff2, args.names)
    except PlanError as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        sys.exit(2)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
