// Localization helpers shared by the extension's pages.
//
// Static markup is translated by tagging it in the HTML:
//   data-i18n           -> textContent
//   data-i18n-title     -> title attribute
//   data-i18n-aria-label-> aria-label attribute
//   data-i18n-placeholder-> placeholder attribute
//   data-i18n-html      -> innerHTML (only for text with inline <code>)
// Dynamic strings go through t(). English stays in the HTML as a fallback, so
// a page still reads correctly if a message is ever missing.

export function uiLanguage() {
  try {
    return chrome.i18n.getUILanguage() || "en";
  } catch {
    return "en";
  }
}

export function t(key, substitutions) {
  try {
    return chrome.i18n.getMessage(key, substitutions) || "";
  } catch {
    return "";
  }
}

const ATTRIBUTES = [
  ["data-i18n-title", "title"],
  ["data-i18n-aria-label", "aria-label"],
  ["data-i18n-placeholder", "placeholder"],
];

export function localizeDocument(doc = document) {
  doc.documentElement.lang = uiLanguage();

  for (const el of doc.querySelectorAll("[data-i18n]")) {
    const text = t(el.dataset.i18n);
    if (text) el.textContent = text;
  }

  for (const el of doc.querySelectorAll("[data-i18n-html]")) {
    const html = t(el.dataset.i18nHtml);
    if (html) el.innerHTML = html;
  }

  for (const [attribute, target] of ATTRIBUTES) {
    for (const el of doc.querySelectorAll(`[${attribute}]`)) {
      const value = t(el.getAttribute(attribute));
      if (value) el.setAttribute(target, value);
    }
  }
}
