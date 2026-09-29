export type Language = 'en' | 'it';

const english = {
  documentTitle: 'Milo — Route preparation preview',
  skipLink: 'Skip to main content',
  language: 'Language',
  previewLabel: 'Interface preview',
  heading: 'Get to know your route before you go.',
  introduction:
    'Milo is being built to help you understand and rehearse a walking route before you leave, with your own screen reader.',
  previewDescription:
    'Route planning is not connected yet. You can try the text controls and keyboard navigation here.',
  requestLabel: 'Your request',
  requestHint:
    'Type your request. Use Send request or press Ctrl+Enter (Windows/Linux) or Command+Enter (Mac). Enter adds a new line.',
  sendRequest: 'Send request',
  emptyRequest: 'Enter a request before sending.',
  responseHeading: 'Milo’s response',
  initialResponse:
    'Type a request to try the text controls. This preview cannot plan or rehearse a route yet.',
  unavailableResponse:
    'Route planning is not connected in this preview. Your request is still here; you can edit it.',
  keyboardHelp: 'Keyboard help',
  keyboardMove: 'Use Tab to move to the next control and Shift+Tab to move back.',
  keyboardSend:
    'In the request field, Ctrl+Enter (Windows/Linux) or Command+Enter (Mac) sends your request. Enter adds a new line.',
  keyboardReader:
    'Use your screen reader’s heading and landmark shortcuts to move around the page. Responses are announced without moving your focus.',
  privacy:
    'This preview keeps your text only while this page is open. It does not send or save your request.',
  mobility:
    'Milo complements your cane, guide dog and orientation and mobility skills.',
};

type Messages = { [Key in keyof typeof english]: string };

export const messages: Record<Language, Messages> = {
  en: english,
  it: {
    documentTitle: 'Milo — Anteprima della preparazione dei percorsi',
    skipLink: 'Vai al contenuto principale',
    language: 'Lingua',
    previewLabel: 'Anteprima dell’interfaccia',
    heading: 'Conosci il percorso prima di partire.',
    introduction:
      'Milo nasce per aiutarti a capire e provare un percorso a piedi prima di uscire, con il tuo lettore di schermo.',
    previewDescription:
      'La pianificazione dei percorsi non è ancora collegata. Qui puoi provare i comandi di testo e la navigazione da tastiera.',
    requestLabel: 'La tua richiesta',
    requestHint:
      'Scrivi la tua richiesta. Usa Invia richiesta oppure premi Ctrl+Invio (Windows/Linux) o Comando+Invio (Mac). Invio va a capo.',
    sendRequest: 'Invia richiesta',
    emptyRequest: 'Scrivi una richiesta prima di inviarla.',
    responseHeading: 'La risposta di Milo',
    initialResponse:
      'Scrivi una richiesta per provare i comandi di testo. Questa anteprima non può ancora pianificare o simulare un percorso.',
    unavailableResponse:
      'La pianificazione dei percorsi non è collegata in questa anteprima. La tua richiesta è ancora qui; puoi modificarla.',
    keyboardHelp: 'Aiuto per la tastiera',
    keyboardMove:
      'Usa Tab per passare al controllo successivo e Maiusc+Tab per tornare al precedente.',
    keyboardSend:
      'Nel campo della richiesta, Ctrl+Invio (Windows/Linux) o Comando+Invio (Mac) invia la richiesta. Invio va a capo.',
    keyboardReader:
      'Usa i comandi del tuo lettore di schermo per spostarti tra intestazioni e aree della pagina. Le risposte vengono annunciate senza spostare il focus.',
    privacy:
      'Questa anteprima mantiene il testo solo mentre la pagina è aperta. Non invia né salva la tua richiesta.',
    mobility:
      'Milo affianca il bastone, il cane guida e le tue competenze di orientamento e mobilità.',
  },
};
