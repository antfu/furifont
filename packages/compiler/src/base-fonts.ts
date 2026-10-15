/** A font Furifont downloads on demand, named by family and style: `Source Han Serif JP Bold`. */
export interface BaseFont {
  name: string
  url: string
}

function sourceHan(face: 'Sans' | 'Serif', weights: string[]): BaseFont[] {
  return weights.map(weight => ({
    name: `Source Han ${face} JP ${weight}`,
    // Not github.com/…/raw/…: browsers refuse its redirect, which has no CORS header.
    url: `https://raw.githubusercontent.com/adobe-fonts/source-han-${face.toLowerCase()}/release/SubsetOTF/JP/SourceHan${face}JP-${weight}.otf`,
  }))
}

/** Every weight in one TrueType font: the CFF2 one Adobe also has is not one Furifont can build on. */
function sourceHanVariable(face: 'Sans' | 'Serif'): BaseFont {
  return {
    name: `Source Han ${face} JP VF`,
    url: `https://raw.githubusercontent.com/adobe-fonts/source-han-${face.toLowerCase()}/release/Variable/TTF/Subset/SourceHan${face}JP-VF.ttf`,
  }
}

export const BASE_FONTS: readonly BaseFont[] = [
  ...sourceHan('Sans', ['ExtraLight', 'Light', 'Normal', 'Regular', 'Medium', 'Bold', 'Heavy']),
  sourceHanVariable('Sans'),
  ...sourceHan('Serif', ['ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'Heavy']),
  sourceHanVariable('Serif'),
]
