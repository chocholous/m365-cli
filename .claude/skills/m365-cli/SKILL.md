---
name: m365-cli
description: "Použij VŽDY před spuštěním jakéhokoli příkazu `m365` (CLI for Microsoft 365 — SharePoint, Entra, Teams, OneDrive, Planner, Viva). Vynucuje ověření příkazu a options proti offline stromu commands.json místo hádání, hlídá destruktivní příkazy a nese mapu chyba→příčina pro tenhle tenant."
version: 4.0.0
compatibility: "@pnp/cli-microsoft365 v11.10.0, node v26.4.0, zsh/bash"
user-invocable: true
---

# m365 CLI

## Začni tímhle

```bash
source scripts/env.sh     # načte .env, nastaví $M, hlasitě selže když něco chybí
npm run doctor            # když něco nefunguje: binárka, .env, login, dostupnost SPO
```

`env.sh` funguje v zsh i bash a z libovolného adresáře uvnitř projektu. Prostředí (účet,
tenant, SPO root) je v **`.env`**, ne v tomhle textu; `.env.example` u každé hodnoty nese
příkaz, kterým se zjistí. Lokální `m365` má jinou verzi než globální — `$M` míří na lokální.

**Než z chyby uděláš závěr, spusť `npm run doctor`.** Většina „nefunguje to" jsou
oprávnění, špatná SPO doména nebo nepřihlášení — ne syntaxe.

## Pravidlo: nehádej options

`m365` má **896 příkazů**. Neznámou option CLI odmítne, ale špatně pochopenou sémantiku
spolkne. Proto dva kroky, ani jeden se nepřeskakuje:

```bash
npm run lookup -- spo page add      # existuje? přesná jména options? enumy?
$M spo page add --help full         # povinnost (<> vs []), význam, příklady
```

Lookup čte `commands.json` v `node_modules/@pnp/cli-microsoft365/`. Sám strom **verzi
nenese**, proto si lookup vedle něj drží otisk `commands.version` a při každém běhu ho
porovná s verzí nainstalovaného balíčku — při neshodě regeneruje. Upgrade i `npm ci`
navíc celý adresář balíčku nahradí, takže oba soubory zmizí a vygenerují se znovu.

Režimy lookupu (strom / options / fulltext) vypíše `npm run lookup -- --help`.

**Co `commands.json` NENESE:** povinné vs volitelné, popis, příklady, oprávnění.
Na to je `--help` (sekce `options` (default), `examples`, `remarks`, `permissions`,
`response`, `full`). Když `--help` říká něco jiného než tvá představa nebo než
dokumentace, **platí `--help`**.

## Pravidlo: zápisy potvrzuj

Mezi 896 příkazy jsou nevratné (`spo site remove`, `spo list remove`, `entra user remove`,
`* set`, `* remove`, `* add`). Než spustíš cokoli jiného než čtení:

1. Ověř cíl čtecím příkazem (`spo web get`, `spo list get`, `entra user get`) — že existuje
   a že je to opravdu on.
2. Vypiš uživateli přesný příkaz a co udělá. **Nespouštěj destruktivní příkaz bez potvrzení.**

**Past `-f, --force` (ověřeno na `spo list remove`):** velká část destruktivních příkazů
ho má a potlačuje jím potvrzovací dotaz. Bez něj se CLI ptá interaktivně — a protože agent nemá TTY, spadne:

```
? Are you sure you want to remove the list …? (Y/n)
{"error":{"name":"ExitPromptError"}}          rc=1
```

To je **fail-safe: operace NEPROBĚHLA.** Nesmíš to „opravit" přidáním `--force` — tím ji
naopak tiše provedeš. `ExitPromptError` znamená *zeptej se uživatele*, ne *obejdi dotaz*.
(Nastavení `prompt: false` na tohle nemá vliv, týká se jen rozlišování víc nalezených
výsledků.)

Čtecí příkazy (`get`, `list`) spouštěj volně.

## Chyby: co znamenají

Chyby chodí **na stdout jako JSON** (`errorOutput=stdout`), takže vypadají jako data.
Vždy zkontroluj, jestli odpověď není `{"error": …}`.

| Výstup | Příčina | Co s tím |
|---|---|---|
| `Invalid option: 'x'` | špatné jméno option | `npm run lookup -- <cmd>` |
| `{"error":{}}` | **skrytý HTTP status**, typicky 401 | `--debug 2>&1 \| rg -i '"status"\|www-authenticate'` → obvykle špatná SPO doména / cizí tenant |
| `Attempted to perform an unauthorized operation.` | chybí role (SharePoint admin) | oprávnění, **ne** syntaxe — nepřepisuj příkaz |
| `{"error":{"name":"ExitPromptError"}}` | destruktivní příkaz čeká na potvrzení, není TTY | operace neproběhla — **zeptej se uživatele**, nepřidávej `--force` |
| prázdný výsledek | může být i nepřihlášení | `npm run doctor`, než uzavřeš, že „tam nic není" |

**Graph scopes ≠ SPO scopes.** Aplikace může mít `AllSites.FullControl` na resource
`00000003-0000-0ff1-ce00-000000000000` (SharePoint), a přesto padat na Graphu
(`m365 search`) kvůli chybějícím `Files.Read.All` / `Sites.Read.All`.

Co má **tenhle** účet reálně k dispozici, zjistíš `m365 cli doctor` — vrací `roles`
a `scopes` per resource. Zjisti to, než na oprávněních postavíš plán; consent se mění.

## Co tenhle skill NEŘEŠÍ

Doménové know-how tvého SharePointu (canvas, SPFx, struktura webů, deploy recepty) —
to patří do vlastního skillu nad tímhle. Read-only hledání v M365 obsahu → M365 MCP.
Kontrolu stránek v prohlížeči → Playwright.
