# Jarvis Translate

A live two-way translator that runs in the browser. No build step, no API key.

## What it does

- **Conversation**: two mic buttons, one per language. Tap, speak, and the translation shows up and is read aloud. "Take turns automatically" hands the mic to the other person after each translation.
- **Text**: type or paste up to 2,000 characters and get a translation as you type.
- **History**: every translation is kept on the device. Save the ones you want to keep as a phrasebook.
- 28 languages, including English, Mandarin, Cantonese, Malay and Tamil.
- Installable to a phone's home screen (PWA).

## How it works

| Job | What does it |
| --- | --- |
| Listening | The browser's Web Speech API (Chrome, Edge, Safari. Not Firefox.) |
| Translating | Chrome's on-device Translator when the language pack is already installed, otherwise the free [MyMemory](https://mymemory.translated.net/doc/spec.php) API |
| Speaking | The browser's built-in voices |

Things to know:

- MyMemory's free tier has a daily limit per IP address. The app shows a message when it's reached.
- Text you translate is sent to MyMemory, and Chrome sends mic audio to Google for recognition. Don't use it for anything confidential.
- History is stored in the browser's local storage only.

## Run it

The mic only works on `https://` or `localhost`.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

To put it online, host the folder as a static site (GitHub Pages, Vercel, Netlify). There is nothing to build.
