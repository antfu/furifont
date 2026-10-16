# Dictionary data license

The files in `data` are compiled from:

- [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html), [JMnedict](https://www.edrdg.org/enamdict/enamdict_doc.html) and [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project), property of the [Electronic Dictionary Research and Development Group](https://www.edrdg.org/), used in conformance with the Group's [licence](https://www.edrdg.org/edrdg/licence.html).
- [JmdictFurigana](https://github.com/Doublevil/JmdictFurigana) by Doublevil, which also aligns JMnedict.
- [yomitan-jlpt-vocab](https://github.com/stephenmk/yomitan-jlpt-vocab) by stephenmk, for `data/jlpt.json`: [Jonathan Waller's JLPT lists](http://www.tanos.co.uk/jlpt/) (Creative Commons Attribution), tied to JMdict entries.
- The [Tatoeba](https://tatoeba.org/) project's Japanese sentences and their JMdict index, for `data/tatoeba.json`, as distributed by the EDRDG ([examples.utf](http://ftp.edrdg.org/pub/Nihongo/examples.utf.gz)), under [Creative Commons Attribution 2.0 France](https://creativecommons.org/licenses/by/2.0/fr/). Many of them come from the Tanaka Corpus.
- The [JR station list of Desktop Tetsu](https://www.desktoptetsu.com/quiz/jr-stations.htm), for the station names of `raw/jr-stations.json`.
- [Japan Post's postal code data](https://www.post.japanpost.jp/zipcode/download.html), for the municipality and town names of `raw/japan-post.json`, as republished by [zipcloud](http://zipcloud.ibsnet.co.jp/).

All of them but Tatoeba are licensed under [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/), and so is the compiled data. The versions used are recorded in its `sources` field.

The code in `src` and `scripts` is MIT licensed, like the rest of the repository.
