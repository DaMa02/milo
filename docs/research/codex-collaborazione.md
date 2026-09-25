# Ricerca · collaborazione con Codex cloud

Fonte: Codex (web search su documentazione OpenAI), 25/09/2026.

Non serve trasferire il repo in un’organizzazione: un repo personale privato può funzionare. La configurazione più semplice è:

1. Il proprietario del repo collega GitHub in Codex cloud e, durante il flusso, installa la GitHub App **ChatGPT Codex Connector** sul proprio account GitHub personale, autorizzandola per quel solo repository.
2. Ogni collaboratore collega il suo account GitHub personale al proprio Codex/ChatGPT e deve già essere collaboratore del repo.
3. Entrambi creano/usano l’ambiente Codex per quel repository, ciascuno lanciando task e aprendo PR dalla propria sessione.

OpenAI documenta che in Codex cloud si collega GitHub e si scelgono esplicitamente i repository accessibili; il task produce un diff e poi una PR. [Codex cloud: setup](https://learn.chatgpt.com/docs/cloud)

Attenzione alla distinzione: un collaboratore non può installare un’app sull’account personale del proprietario; quell’installazione è un’azione del proprietario. Non deve però per questo diventare owner di un’organizzazione. La documentazione OpenAI non contiene una frase esplicita sul caso preciso “collaboratore di repo personale + Codex cloud”, quindi questa parte va verificata con un task banale: “aggiungi un commento a README e apri una PR”. La documentazione conferma almeno che il setup della code review richiede push o admin sul repo e che Codex usa il repository connesso. [GitHub con Codex](https://learn.chatgpt.com/docs/third-party/github)

La free organization con entrambi owner è invece la struttura più pulita se il progetto continua: installazione dell’app a livello org, ruoli gestibili, nessuna dipendenza dal singolo account del proprietario. Ma a ridosso di un hackathon trasferire il repo aggiunge attrito e possibili sorprese: non lo farei solo per Codex.

## Ambiente Codex cloud

In **Codex settings → Environments** configurate:

- Setup script: installazione dipendenze e controlli riproducibili, per esempio `pnpm install --frozen-lockfile` e `pnpm run lint`. Codex esegue il setup prima dell’agente; con cache, può eseguire un maintenance script. Gli `export` nello script non persistono nella fase agente: impostate le variabili nella UI dell’ambiente. [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environment)
- Internet: il setup ha internet; durante il task agente è **off di default**. Lasciatelo off salvo necessità reale. Se serve, abilitate solo domini necessari e metodi `GET`, `HEAD`, `OPTIONS`; esistono preset “Common dependencies” e “All”. [Internet access](https://learn.chatgpt.com/docs/cloud/internet-access)
- Variabili/segreti: le env var sono leggibili per tutta la chat, quindi **non** mettete API key reali lì. I “Secrets” cifrati sono disponibili soltanto nello setup e vengono rimossi prima della fase agente. Per test API durante il task, preferite mock/local fake o una chiave temporanea, strettamente limitata e revocabile. [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environment)

`AGENTS.md` viene letto prima del lavoro. Codex carica prima le istruzioni globali, poi quelle dal root Git fino alla cartella corrente; il file più vicino prevale. In ciascuna cartella `AGENTS.override.md` prevale su `AGENTS.md`. Tenetelo breve e operativo: comandi di test, convenzioni di branch/PR, file sensibili da non toccare, “mai committare `.env`”. [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

## Parallelismo e merge

Usate task piccoli e non sovrapposti: uno per feature/UI, uno per test, uno per documentazione o bug separato. Ogni task parte da `main` aggiornato e apre una PR distinta.

Convenzione pratica:

- `codex/42-export-csv`
- `claude/43-auth-form`
- `human/44-deploy-config`

Non avviate due agenti sugli stessi file centrali (`package.json`, schema DB, router principale, lockfile). Se una modifica a contratto/schema è necessaria, fatela e mergiatela prima; poi fate ripartire gli altri task da `main`. Reviewate diff e test prima del merge, fate merge uno per volta e aggiornate/rebase le PR restanti.

Per Codex CLI parallelo, usate un worktree per sessione/branch. I worktree isolano checkout e modifiche, evitando che due sessioni tocchino la stessa directory; Git non consente però di checkoutare lo stesso branch in due worktree. [Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)

Nel CLI userei normalmente `workspace-write` + `on-request`: può editare e lanciare comandi ordinari nel progetto, ma chiede per rete o uscite dal perimetro. Per task totalmente locali e già isolati in worktree, `workspace-write` + `never` è ragionevole; evitate `danger-full-access`, soprattutto con chiavi GitHub, browser, SSH o file personali presenti sulla macchina. [Sandbox e approvazioni](https://learn.chatgpt.com/docs/sandboxing)

## Convivenza con Claude Code

Fate di `AGENTS.md` il contratto comune. In `CLAUDE.md`, importatelo con:

```md
@AGENTS.md
```

e lasciate in `CLAUDE.md` soltanto istruzioni specifiche a Claude. Convenzioni condivise: niente push diretto su `main`; un agent = un branch/PR; descrivere nel PR test eseguiti e file toccati; non riformattare file estranei al task; fermarsi se trova modifiche non proprie.

Non ho verificato da documentazione Anthropic l’attuale sintassi/import di `CLAUDE.md`, perché la ricerca richiesta era limitata alle fonti ufficiali OpenAI; verificherei quel singolo punto nella vostra installazione Claude prima dell’hackathon.