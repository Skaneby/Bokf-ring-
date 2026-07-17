// E2E-svit för Lokal Bokföring — verifierar UI OCH uträknade belopp i
// webbläsare, både desktop (1280px) och mobil (375px). Varje test startar
// med tom databas (ny browser-context = tom IndexedDB) och bygger sitt
// eget bokföringsläge. Taggar: @both körs i båda projekten, @desktop/@mobile
// i respektive. Kör: npm run test:e2e

import { test, expect, Page } from '@playwright/test';

// Belopp formateras med sv-SE (mellanslag/nbsp + "kr") — normalisera före jämförelse
const digits = (s: string | null) => (s ?? '').replace(/[^\d,−-]/g, '');

async function expectAmount(page: Page, container: ReturnType<Page['locator']>, expected: string) {
  await expect
    .poll(async () => digits(await container.textContent()))
    .toContain(expected);
}

// Startar från tom DB: skapa bokföring (utan fil — filpickern är nativ och
// kan inte styras i headless) → stäng guiden
async function freshStart(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Skapa utan fil/ }).click();
  // Onboarding visas automatiskt första gången
  await page.getByRole('button', { name: 'Stäng guiden' }).click();
  await expect(page.getByRole('heading', { name: 'Översikt' })).toBeVisible();
}

// Navigera via sidomenyn — öppnar hamburgaren först på mobil
async function gotoTab(page: Page, name: string) {
  const burger = page.getByRole('button', { name: 'Öppna meny' });
  if (await burger.isVisible()) await burger.click();
  await page.getByRole('navigation').getByRole('button', { name }).click();
}

// Bokför ett inköp med momshjälpen: brutto inkl. 25 % moms mot konto 5410
async function bookPurchase(page: Page, gross: string) {
  await gotoTab(page, 'Bokför');
  // Guide när bokföringen saknar databasfil: förklaring + skapa-knapp,
  // avfärdas för sessionen ("utan fil"-flödet i testerna)
  const prompt = page.getByText('din bokföring har ingen databasfil ännu');
  if (await prompt.isVisible().catch(() => false)) {
    await expect(page.getByRole('button', { name: /Skapa databasfil/ })).toBeVisible();
    await page.getByRole('button', { name: /Senare — jag förstår risken/ }).click();
  }
  await page.getByPlaceholder('T.ex. Inköp kontorsmaterial').fill('Kontorsmaterial E2E');

  const vatSection = page.locator('div').filter({ has: page.getByText('Momshjälp', { exact: true }) }).last();
  await vatSection.getByRole('combobox').first().selectOption('25');
  await page.getByText('Belopp inkl. moms').locator('..').locator('input').fill(gross);
  await page.getByRole('button', { name: 'Fyll i rader' }).click();

  await page.getByLabel('Konto rad 1').selectOption('5410');
  await page.locator('form').getByRole('button', { name: 'Bokför', exact: true }).click();
  await expect(page.getByText('Verifikation bokförd.')).toBeVisible();
}

// ═══════════════════════════════════════════════════════════════════════════
// GRUNDFLÖDE — körs på både desktop och mobil
// ═══════════════════════════════════════════════════════════════════════════

test('@both grundflöde: välkomst → guide → bokför med moms → korrekt översikt', async ({ page }) => {
  await page.goto('/');

  // Skapa bokföring-skärmen vid tom DB: namn + alla alternativ
  await expect(page.getByText('Det finns ingen bokföringsdatabas här ännu')).toBeVisible();
  await expect(page.getByLabel('Bokföringens namn')).toHaveValue('Min bokföring');
  await expect(page.getByRole('button', { name: /Skapa ny bokföring med databasfil/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Öppna befintlig bokföringsfil/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ladda in JSON-backup/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Importera SIE4-fil/ })).toBeVisible();
  // Namnge bokföringen och skapa (utan fil — nativ filpicker kan inte styras headless)
  await page.getByLabel('Bokföringens namn').fill('E2E Bokföring');
  await page.getByRole('button', { name: /Skapa utan fil/ }).click();

  // Onboarding: 8 steg, gå igenom två och stäng
  await expect(page.getByText('Välkommen till Lokal Bokföring')).toBeVisible();
  await expect(page.getByText('steg 1 av 8')).toBeVisible();
  await page.getByRole('button', { name: /Nästa/ }).click();
  await expect(page.getByText('Dubbelbokföring på 30 sekunder')).toBeVisible();
  await page.getByRole('button', { name: 'Stäng guiden' }).click();

  // Bokför inköp 1 250 kr inkl. moms → netto 1 000, moms 250
  await bookPurchase(page, '1250');

  // Momshjälpen ska ha förhandsvisat splitten korrekt innan bokning skedde,
  // och Översikten ska nu visa uträknade belopp
  await gotoTab(page, 'Översikt');
  const kpi = (label: string) =>
    page.locator('div').filter({ has: page.getByText(label, { exact: true }) }).last();
  await expectAmount(page, kpi('Kostnader'), '1000,00');
  await expectAmount(page, kpi('Tillgångar'), '−1000,00'); // bank −1250 + ingående moms 250

  // Årets resultat = −1 000 (bara kostnad)
  await expectAmount(page, kpi('Årets resultat'), '1000,00');

  // Verifikationsräknaren
  await expect(page.getByText('Verifikationer', { exact: true }).locator('..')).toContainText('1');

  // Appen minns bokföringens namn — visas i sidomenyn (öppna den på mobil)
  const burger = page.getByRole('button', { name: 'Öppna meny' });
  if (await burger.isVisible()) await burger.click();
  await expect(page.getByText('E2E Bokföring')).toBeVisible();
  await expect(page.getByText(/Endast i webbläsaren/)).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════════
// DESKTOP-FLÖDEN
// ═══════════════════════════════════════════════════════════════════════════

test('@desktop fakturaflöde: inställningar → skapa → bokförd → betald → rapporter stämmer', async ({ page }) => {
  await freshStart(page);

  // Företagsuppgifter (krävs även för SRU senare)
  await gotoTab(page, 'Fakturor');
  await page.getByRole('button', { name: 'Inställningar' }).click();
  await page.getByText('Företagsnamn *').locator('..').locator('input').fill('E2E Firman');
  await page.getByPlaceholder('XXXXXX-XXXX').fill('556000-0167');
  await page.getByRole('button', { name: 'Spara inställningar' }).click();
  await expect(page.getByText('Sparat ✓')).toBeVisible();

  // Skapa faktura: 1 × 1000 kr + 25 % moms = 1 250 kr (fakturametoden)
  await page.getByRole('button', { name: 'Ny faktura' }).click();
  await page.getByPlaceholder('Kund AB').fill('Kund E2E AB');
  await page.getByLabel('Beskrivning rad 1').fill('Konsultarbete');
  await page.getByLabel('Antal rad 1').fill('1');
  await page.getByLabel('À-pris rad 1').fill('1000');
  // Summeringen räknas live
  await expectAmount(page, page.getByText('Att betala').locator('..'), '1250,00');
  await page.getByRole('button', { name: 'Skapa faktura' }).click();

  // Lista: faktura 1, obetald, bokförd (fakturametoden) + arkivfilen nedladdad
  await expect(page.getByText('Faktura 1', { exact: true })).toBeVisible();
  await expect(page.getByText(/Obetalda \(1\)/)).toBeVisible(); // statusfilter räknar
  await expect(page.getByText('skapad och bokförd')).toBeVisible();

  // "Visa" öppnar den ARKIVERADE fakturafilen i en inbäddad visare MED tillbaka-knapp
  // (inte i ny flik — där saknas väg tillbaka, särskilt i PWA-läge på iPad)
  await page.getByRole('button', { name: 'Visa', exact: true }).click();
  const viewer = page.getByTestId('invoice-viewer');
  await expect(viewer.getByRole('button', { name: 'Tillbaka' })).toBeVisible();
  const invoiceFrame = viewer.frameLocator('iframe[title="Förhandsvisning av faktura"]');
  await expect(invoiceFrame.locator('body')).toContainText('Kund E2E AB');
  await expect(invoiceFrame.locator('body')).toContainText('Faktura');
  await viewer.getByRole('button', { name: 'Tillbaka' }).click();
  await expect(viewer).toHaveCount(0);

  // E-post: laddar ned filen och öppnar mailto (mailto kan inte bifoga — filen följer separat)
  const mailDl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'E-post' }).click();
  expect((await mailDl).suggestedFilename()).toBe('faktura-1.html');

  // Registrera betalning
  await page.getByRole('button', { name: 'Registrera betalning' }).click();
  await page.getByRole('button', { name: 'Bekräfta' }).click();
  await expect(page.getByText('Betald', { exact: true })).toBeVisible();

  // Statusfilter: obetalda är nu tomt
  await page.getByRole('button', { name: /Obetalda \(0\)/ }).click();
  await expect(page.getByText(/Inga obetalda fakturor/)).toBeVisible();
  await page.getByRole('button', { name: 'Alla', exact: true }).click();

  // Rapporter: intäkt 1 000 (netto), balans: bank 1 250 efter betalning
  await gotoTab(page, 'Rapporter');
  await expectAmount(page, page.getByText('Summa intäkter').locator('..'), '1000,00');
  await page.getByRole('button', { name: 'Balansräkning' }).click();
  await expectAmount(page, page.getByText('Summa tillgångar').locator('..'), '1250,00');

  // Huvudbok: två verifikat (skapande + betalning)
  await page.getByRole('button', { name: 'Huvudbok' }).click();
  await expect(page.getByText(/Faktura 1 — Kund E2E AB/)).toBeVisible();
  await expect(page.getByText(/Betalning faktura 1/)).toBeVisible();
});

test('@desktop deklaration: NE-värden, justering med omräkning, SRU-export, INK2-växel', async ({ page }) => {
  await freshStart(page);

  // Företagsuppgifter krävs för SRU-generering
  await gotoTab(page, 'Fakturor');
  await page.getByRole('button', { name: 'Inställningar' }).click();
  await page.getByText('Företagsnamn *').locator('..').locator('input').fill('E2E Firman');
  await page.getByPlaceholder('XXXXXX-XXXX').fill('556000-0167');
  await page.getByRole('button', { name: 'Spara inställningar' }).click();
  await expect(page.getByText('Sparat ✓')).toBeVisible();

  // Bokför kostnad 1 250 inkl. moms (R6: 1 000) — inget överskott ännu
  await bookPurchase(page, '1250');

  await gotoTab(page, 'Rapporter');
  await page.getByRole('button', { name: 'Deklaration (NE)' }).click();

  // NE-raderna: R6 övriga externa = 1 000, B9 kassa/bank = −1 250 (kredit)
  const row = (id: string) =>
    page.locator('div').filter({ has: page.getByText(id, { exact: true }) }).last();
  await expectAmount(page, row('R6'), '1000,00');
  await expectAmount(page, row('R11'), '−1000,00');
  await expect(page.getByText('Underskott av näringsverksamhet')).toBeVisible();

  // Justera R1 manuellt till 5 000 → R11 räknas om till 4 000 → överskott
  await page.getByLabel('Justera R1', { exact: true }).click();
  await page.getByLabel('Deklarerat värde R1').fill('5000');
  await page.getByLabel('Anteckning för justering av R1').fill('E2E-test');
  await page.getByRole('button', { name: 'Spara', exact: true }).click();
  await expect(page.getByText('Justerad')).toBeVisible();
  await expectAmount(page, row('R11'), '4000,00');
  await expect(page.getByText('Överskott av näringsverksamhet')).toBeVisible();

  // Återställ justeringen
  await page.getByLabel('Återställ R1 till bokfört värde').click();
  await expectAmount(page, row('R11'), '−1000,00');

  // SRU-export: bekräfta → generera → båda filerna nedladdningsbara
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Generera SRU-filer/ }).click();
  await expect(page.getByRole('button', { name: /INFO\.SRU/ })).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /BLANKETTER\.SRU/ }).click();
  expect((await dl).suggestedFilename()).toBe('BLANKETTER.SRU');
  await expect(page.getByText(/Döp inte om dem/)).toBeVisible();

  // Växla till INK2: officiella poster + balanskontroll renderas
  await page.getByRole('combobox').nth(1).selectOption('INK2');
  await expect(page.getByText('Kassa, bank och redovisningsmedel')).toBeVisible();
  await expect(page.getByText('Summa eget kapital och skulder (inkl. årets resultat)')).toBeVisible();
  await expect(page.getByText('Skattemässigt resultat', { exact: true })).toBeVisible();
});

test('@desktop gemini-import, AI-gate utan nyckel och backupnedladdning', async ({ page }) => {
  await freshStart(page);

  // Gemini-import: klistra in JSON → förslag med konto → bokför
  await gotoTab(page, 'Importera');
  await page.locator('textarea').fill(JSON.stringify([{
    date: '2026-05-15', description: 'Kontorsmaterial', amount: 250,
    vat_rate: 25, suggested_account: 6110,
  }]));
  await page.getByRole('button', { name: 'Importera och analysera' }).click();
  await expect(page.getByText('Gemini', { exact: true })).toBeVisible(); // källbadge
  await page.getByRole('button', { name: /Godkänn och bokför 1 st/ }).click();
  await expect(page.getByText(/1 verifikation bokförda!/)).toBeVisible();

  // AI-hjälp utan nyckel: boten svarar själv med instruktionen
  await gotoTab(page, 'AI-hjälp');
  await expect(page.getByText('Din Gemini API-nyckel')).toBeVisible(); // inställningar auto-öppna
  await page.getByLabel('Fråga till AI-hjälpen').fill('Hur bokför jag moms?');
  await page.getByLabel('Skicka').click();
  await expect(page.getByText(/du behöver först lägga in din egen Gemini API-nyckel/)).toBeVisible();

  // Backupnedladdning från sidomenyn
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ladda ned backup' }).click();
  expect((await dl).suggestedFilename()).toMatch(/^bokforing-\d{4}-\d{2}-\d{2}\.json$/);

  // Kontoplan: skyddad radering — konto med transaktioner (6110) blockeras
  await gotoTab(page, 'Kontoplan');
  await page.getByLabel('Radera konto 6110').click();
  await page.getByRole('button', { name: 'Radera', exact: true }).click();
  await expect(page.getByText(/kan inte raderas/)).toBeVisible();
});

test('@desktop kvittobilagor: bifoga vid bokning → syns i huvudbok → radera', async ({ page }) => {
  await freshStart(page);

  // Bokför med bifogad kvittobild
  await gotoTab(page, 'Bokför');
  await page.getByPlaceholder('T.ex. Inköp kontorsmaterial').fill('Inköp med kvitto');
  await page.getByLabel('Bifoga kvitto').setInputFiles({
    name: 'kvitto.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 1, 2, 3]),
  });
  await expect(page.getByText('kvitto.png')).toBeVisible(); // chip i formuläret

  await page.getByLabel('Konto rad 1').selectOption('5410');
  await page.getByLabel('Debet rad 1').fill('100');
  await page.getByLabel('Konto rad 2').selectOption('1930');
  await page.getByLabel('Kredit rad 2').fill('100');
  await page.locator('form').getByRole('button', { name: 'Bokför', exact: true }).click();
  await expect(page.getByText('Verifikation bokförd.')).toBeVisible();

  // Huvudboken visar bilagan på verifikatet
  await gotoTab(page, 'Rapporter');
  await page.getByRole('button', { name: 'Huvudbok' }).click();
  await expect(page.getByLabel('Öppna bilagan kvitto.png')).toBeVisible();

  // Bifoga ytterligare en direkt i huvudboken
  await page.getByLabel(/Bifoga kvitto till verifikat/).setInputFiles({
    name: 'faktura.pdf', mimeType: 'application/pdf', buffer: Buffer.from([37, 80, 68, 70]),
  });
  await expect(page.getByLabel('Öppna bilagan faktura.pdf')).toBeVisible();

  // Radera en bilaga
  await page.getByLabel('Radera bilagan kvitto.png').click();
  await expect(page.getByLabel('Öppna bilagan kvitto.png')).not.toBeVisible();
  await expect(page.getByLabel('Öppna bilagan faktura.pdf')).toBeVisible();
});

test('@mobile fakturadesign (WYSIWYG) fungerar på liten skärm', async ({ page }) => {
  await freshStart(page);
  await gotoTab(page, 'Fakturor');
  await page.getByRole('button', { name: 'Inställningar' }).click();

  // Öppna den visuella temaredigeraren
  await page.getByRole('button', { name: /Anpassa utseende/ }).click();

  // Kontrollerna finns och fungerar på mobil
  await expect(page.getByLabel('Accentfärg')).toBeVisible();
  await page.getByLabel('Rubriktext').fill('OFFERT');

  // Live-förhandsvisningen (iframe) renderar den ändrade rubriken
  const preview = page.frameLocator('iframe[title="Förhandsvisning av faktura"]');
  await expect(preview.locator('h1')).toHaveText('OFFERT');

  // Spara temat
  await page.getByRole('button', { name: 'Spara utseende' }).click();
  await expect(page.getByText('Sparat ✓')).toBeVisible();
  await expect(page.getByText(/Anpassat tema/)).toBeVisible();

  // Ingen horisontell scroll trots redigeraren
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

// ═══════════════════════════════════════════════════════════════════════════
// MOBIL — responsivitet
// ═══════════════════════════════════════════════════════════════════════════

test('@mobile responsivitet: hamburgermeny, formulärlayout, ingen horisontell scroll', async ({ page }) => {
  await freshStart(page);

  // Sidomenyn är dold — hamburgaren syns i topbaren
  const burger = page.getByRole('button', { name: 'Öppna meny' });
  await expect(burger).toBeVisible();

  // Öppna menyn → navigera till Bokför → menyn stängs
  await burger.click();
  await page.getByRole('navigation').getByRole('button', { name: 'Bokför' }).click();
  await expect(page.getByRole('heading', { name: 'Ny verifikation' })).toBeVisible();
  await expect(burger).toBeVisible(); // topbaren kvar, menyn stängd

  // Mobillayout i raderna: Debet/Kredit-etiketter (sm:hidden) synliga
  // (desktop-rubriken är också "Debet" men display:none på mobil — sikta på label)
  await expect(page.locator('form label').filter({ hasText: 'Debet' }).first()).toBeVisible();
  // Summa-radens kompakta D/K-prefix synligt på mobil
  await expect(page.locator('form').getByText('D', { exact: true })).toBeVisible();
  await expect(page.locator('form').getByText('K', { exact: true })).toBeVisible();

  // Bokför via momshjälpen fungerar på mobil (touch)
  await bookPurchase(page, '625');
  await gotoTab(page, 'Översikt');
  await expectAmount(
    page,
    page.locator('div').filter({ has: page.getByText('Kostnader', { exact: true }) }).last(),
    '500,00',
  );

  // Ingen horisontell scroll på någon huvudflik
  for (const tab of ['Översikt', 'Bokför', 'Rapporter']) {
    await gotoTab(page, tab);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${tab}: horisontell overflow`).toBeLessThanOrEqual(0);
  }
});
