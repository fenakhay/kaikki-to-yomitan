const LineByLineReader = require('line-by-line');
const { consoleOverwrite, clearConsoleLine, logProgress, findPartOfSpeech, loadJsonArray, writeInBatches, currentDate } = require('./util/util');
const { readdirSync, unlinkSync, writeFileSync } = require('fs');

const { 
    source_iso: sourceIso,
    target_iso: targetIso,
    kaikki_file: kaikkiFile,
    temp_folder: writeFolder,
} = process.env;

const partsOfSpeech = loadJsonArray(`data/language/target-language-tags/en/parts_of_speech.json`);
const skippedPartsOfSpeech = {};

const indexJson = {
    title: `kty-${sourceIso}-${targetIso}-gloss`,
    format: 3,
    revision: currentDate,
    sequenced: true,
    author: 'Kaikki-to-Yomitan contributors',
    url: 'https://github.com/themoeway/kaikki-to-yomitan',
    description: 'Dictionaries for various language pairs generated from Wiktionary data, via Kaikki and Kaikki-to-Yomitan.',
    attribution: 'https://kaikki.org/',
    sourceLanguage: sourceIso,
    targetLanguage: targetIso,
};

const ymtLemmas = [];

let lineCount = 0;
consoleOverwrite(`make-glossary.js started...`);

const lr = new LineByLineReader(kaikkiFile);

lr.on('line', (line) => {
    if (line) {
        lineCount += 1;
        logProgress("Processing lines", lineCount);
        handleLine(line);
    }
});

function handleLine(line) {
    const parsedLine = JSON.parse(line);
    const { pos, senses } = parsedLine;
    const word = getCanonicalForm(parsedLine);
    const reading = getReading(word, parsedLine);

    if(!(word && pos && senses)) return;

    const glosses = [];

    for (const sense of senses) {
        const { translations } = sense;
        if (!translations) continue;
        const formOf = sense.form_of;

        for (const translation of translations) {
            const {code: translationIso, note} = translation;
            if (translationIso !== targetIso) continue;
            const translated = translation.word || note;
            if(!translated) continue;
            glosses.push(translated);
        }

    }

    if (glosses.length === 0) return;
    
    const processedPoS = findPartOfSpeech(pos, partsOfSpeech, skippedPartsOfSpeech);
    ymtLemmas.push([
        word,
        reading,
        processedPoS,
        processedPoS,
        0, // frequency
        [...new Set(glosses)], // glosses
        0, // sequence
        '', // term_tags
    ]);
}

function getCanonicalForm({word, forms}) {
    if(!forms) return word;

    const canonicalForm = forms.find(form => 
        form.tags &&
        form.tags.includes('canonical')
    );
    if (canonicalForm) {
        word = canonicalForm.form;
    }
    return word;
}

function getReading(word, line){
    switch(sourceIso){
        case 'fa':
            return getPersianReading(word, line);
        default:
            return word;
    }
}

function getPersianReading(word, line){
    const {forms} = line;
    if(!forms) return word;
    const romanization = forms.find(({form, tags}) => tags && tags.includes('romanization') && tags.length === 1 && form);
    return romanization ? romanization.form : word;
}


lr.on('end', () => {
    clearConsoleLine();
    process.stdout.write(`Processed ${lineCount} lines...\n`);


    for (const file of readdirSync(`${writeFolder}/dict`)) {
        unlinkSync(`${writeFolder}/dict/${file}`);
    }

    writeFileSync(`${writeFolder}/dict/index.json`, JSON.stringify(indexJson, null, 2));

    return writeInBatches(writeFolder, ymtLemmas, `dict/term_bank_`, 25000);

});
