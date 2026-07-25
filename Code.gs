/**
 * Read-only JSON API for the bound Google Spreadsheet.
 *
 * Запросы:
 *   без параметров → только Kanji, совместимо со старым сайтом
 *   ?type=kanji    → активные кандзи
 *   ?type=words    → активные слова
 *   ?type=all      → активные кандзи и слова
 */

const SHEETS = Object.freeze({
  KANJI: 'Kanji',
  WORDS: 'Слова',
});

const TRUE_VALUES = new Set(['true', '1', 'yes', 'да']);
const ALLOWED_TYPES = new Set(['kanji', 'words', 'all']);

function doGet(e) {
  try {
    const requestedType = normalizeType(e && e.parameter ? e.parameter.type : '');
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const updatedAt = new Date().toISOString();

    if (requestedType === 'all') {
      const kanji = readActiveItems(spreadsheet, SHEETS.KANJI, false);
      const words = readActiveItems(spreadsheet, SHEETS.WORDS, true);

      return jsonResponse({
        success: true,
        type: 'all',
        updatedAt: updatedAt,
        counts: {
          kanji: kanji.length,
          words: words.length,
          total: kanji.length + words.length,
        },
        kanji: kanji,
        words: words,
      });
    }

    const isWords = requestedType === 'words';
    const sheetName = isWords ? SHEETS.WORDS : SHEETS.KANJI;
    const items = readActiveItems(spreadsheet, sheetName, isWords);

    return jsonResponse({
      success: true,
      type: requestedType,
      updatedAt: updatedAt,
      count: items.length,
      items: items,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      success: false,
      error: error && error.message ? error.message : 'Не удалось прочитать таблицу.',
      count: 0,
      items: [],
    });
  }
}

function normalizeType(value) {
  const type = String(value || 'kanji').trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error('Неизвестный параметр type. Используйте kanji, words или all.');
  }
  return type;
}

function readActiveItems(spreadsheet, sheetName, addWordAudio) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Лист «' + sheetName + '» не найден.');

  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];

  const headers = values[0].map(function(value) { return String(value).trim(); });
  const activeIndex = headers.indexOf('active');
  if (activeIndex === -1) {
    throw new Error('В первой строке листа «' + sheetName + '» отсутствует поле active.');
  }

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(value) { return value !== '' && value !== null; });
    })
    .filter(function(row) {
      return TRUE_VALUES.has(String(row[activeIndex]).trim().toLowerCase());
    })
    .map(function(row) {
      const item = {};

      headers.forEach(function(header, index) {
        if (!header) return;
        if (header === 'audio_word_source' || header === 'audio_sentence_source') return;
        item[header] = serializeValue(row[index]);
      });

      if (addWordAudio) {
        const wordAudioText = String(item.tts_word || item.reading || item.japanese || '').trim();
        const exampleAudioText = String(item.tts_example || item.example_reading || item.example_jp || '').trim();

        item.audio = {
          mode: 'speechSynthesis',
          language: 'ja-JP',
          word: wordAudioText,
          example: exampleAudioText,
        };
        item.hasAudio = Boolean(wordAudioText);
        item.hasExampleAudio = Boolean(exampleAudioText);
        delete item.tts_word;
        delete item.tts_example;
      }

      return item;
    });
}

function serializeValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value === null || value === undefined ? '' : value;
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
