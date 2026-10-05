# Stem — Nederlandstalige telefoonassistent

Beheerpaneel en Node.js-webhookserver voor inkomende hospitality-oproepen, gebouwd rond Vapi, Gemini en n8n. De interface en standaardprompt zijn Nederlandstalig. Het aanbod, de prijzen, openingstijden, diensten en bereidingstijden pas je in het dashboard aan.

## Lokaal starten

Vereist Node.js 20 of nieuwer.

1. Vul het lokale, genegeerde `.env`-bestand in met `SUPABASE_URL`, een **nieuwe** server-only `SUPABASE_SECRET_KEY` en `ADMIN_EMAIL`. Deel of commit een secret key nooit.
2. Stel een wachtwoord in met `npm run admin:password`. Het interactieve hulpprogramma slaat alleen de scrypt-hash op in `.env`; het wachtwoord zelf wordt niet opgeslagen.
3. Start de server met `npm start`.
4. Open <http://localhost:3000> en log in met het ingestelde e-mailadres en wachtwoord.

Er zijn geen npm-pakketten nodig. Bedrijfsgegevens, aanbod, boekingen, bestellingen en gespreksverslagen worden in de Supabase-tabel `public.app_state` opgeslagen. De dashboardlogin is app-beheerd en gebruikt geen Supabase Auth: één e-mailadres en een scrypt-wachtwoordhash worden server-side ingesteld. Dashboardroutes vereisen een geldige, HttpOnly-beheerderssessie. De server gebruikt de Supabase-secret key voor databaseverzoeken; deze key omzeilt RLS en mag daarom uitsluitend op de vertrouwde server staan, nooit in de browser. Beveilig en beperk de toegang tot de server en de `.env`-file.

## Testdeployment op Render (zonder Vercel)

In de hoofdmap staat `render.yaml` voor een gratis Render-webservice. De gratis service kan na inactiviteit slapen; gebruik deze tier alleen om te testen, omdat de eerste Vapi-webhook na het slapen vertraging kan oplopen. Voor continu beschikbare telefonie is een always-on hostingplan nodig.

1. Push de projectbestanden naar een GitHub-repository en maak in Render een nieuwe Blueprint aan die deze repository gebruikt.
2. Render leest `render.yaml` en vraagt om de variabelen met `sync: false`. Vul daar de Supabase- en Vapi-geheimen in. Vul voor `ADMIN_PASSWORD_HASH` alleen de gegenereerde scrypt-hash in: maak die lokaal met `npm run admin:password` en kopieer de hash uit `.env`; voer nooit een wachtwoord als Render-variabele in.
3. Vul ook `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` en `N8N_SMS_FROM_NUMBER` in als sms na gesprekken gewenst is. `VAPI_PHONE_NUMBER_ID` is nodig om het telefoonnummer automatisch bij publicatie te koppelen.
4. Render stelt `RENDER_EXTERNAL_URL` beschikbaar. De app gebruikt dit automatisch voor beveiligde cookies, browserherkomstcontroles en de Vapi-webhook; `PUBLIC_BASE_URL` hoeft dus niet handmatig in Render te worden ingesteld.
5. Open na de deployment de Render-URL, meld aan en kies in de instellingen **Assistent naar Vapi sturen** zodat Vapi de Render-webhook gebruikt in plaats van de tijdelijke lokale tunnel.

Zet nooit `.env` of geheimen in GitHub. De tijdelijke gratis Render-service is geschikt voor deploymenttests, maar niet voor betrouwbare beantwoording van oproepen wanneer de service slaapt.

## Deployen op Vercel

De Vercel-deployment gebruikt serverless API-entrypoints in `api/`; `server.js` deelt de routeafhandeling met de lokale Node.js-server. Dashboardbestanden in `public/` worden als statische bestanden aangeboden. Koppel de GitHub-repository aan Vercel en deploy de branch die de actuele code bevat.

Stel de benodigde geheimen in onder **Project Settings → Environment Variables**. Vercel stelt `VERCEL_PROJECT_PRODUCTION_URL` beschikbaar voor de productiehost; de app gebruikt dit automatisch voor Vapi-callbacks als `PUBLIC_BASE_URL` niet expliciet is ingesteld. Controleer na deployment `/api/health` en meld je aan via de productie-URL. Na het instellen van de productiehost moet je in het dashboard **Assistent naar Vapi sturen** kiezen om de callback-URL van de assistent bij te werken.

Applicatiegegevens worden in Supabase opgeslagen. Op Vercel gebruikt de dashboardlogin een ondertekende, stateless sessiecookie zodat meerdere functie-instanties dezelfde sessie kunnen valideren; het wachtwoordhash fungeert als sleutel en een wachtwoordwijziging maakt bestaande cookies ongeldig. Test een Vapi-gesprek en callback na iedere deployment.

## Supabase-database en admin instellen

1. Open het SQL Editor-scherm van project `fkhfuffdbfzpohwphzfu` in het Supabase-dashboard. Voer `supabase/migrations/20261005181000_create_admin_dashboard.sql` uit. Dit maakt de dashboardopslag, initiële voorbeeldcatalogus en restrictieve Row Level Security-policies aan.
2. Stel `ADMIN_EMAIL` in op het admin-e-mailadres dat voor het dashboard gebruikt wordt. Supabase Authentication-gebruikers uitnodigen of `supabase/seed.sql` uitvoeren is niet nodig voor de app-beheerde login.
3. Voer `npm run admin:password` uit in een interactieve terminal om je wachtwoord te kiezen. De invoer wordt niet weergegeven; het hulpprogramma slaat alleen de hash op in het genegeerde `.env`-bestand. Bewaar het wachtwoord in een wachtwoordmanager.
4. Stel de Project URL en een **nieuwe** server-only `SUPABASE_SECRET_KEY` in. Maak in Supabase een nieuwe secret key aan, omdat een geheime key eerder in deze chat is gedeeld. De gedeelde sleutel is niet in de applicatie opgeslagen of gebruikt.
5. Herstart de server en meld aan met het ingestelde e-mailadres en wachtwoord. Wijzigingen aan het wachtwoordhash beëindigen bestaande sessies.

De connection string die met `postgres:[YOUR-PASSWORD]` is aangeleverd bevat geen databasewachtwoord en is niet nodig voor deze REST API-koppeling. Om veiligheidsredenen is het databaseschema niet vanuit deze app op afstand aangemaakt: voer de genoemde migratie zelf uit in de SQL Editor van jouw Supabase-project. De migratie/seed behoudt de oorspronkelijke Supabase Auth-allowlist voor bestaande installaties; de app-beheerde dashboardlogin gebruikt die allowlist niet.

## Vapi, Gemini en een telefoonnummer koppelen

1. Voeg je Google AI API-sleutel toe in het Vapi-dashboard onder de Google/Gemini-providerinstellingen. De lokale waarde `GEMINI_API_KEY` is uitsluitend lokaal opgeslagen; de app stuurt die sleutel niet naar Vapi. Zet providersleutels nooit in de browser.
2. Stel een nieuwe `VAPI_API_KEY`, `PUBLIC_BASE_URL`, `SUPABASE_SECRET_KEY`, `VAPI_WEBHOOK_SECRET` en het Vapi-headercredential-ID `VAPI_WEBHOOK_CREDENTIAL_ID` in op de server. `PUBLIC_BASE_URL` is het publieke HTTPS-adres van deze server: Vapi gebruikt dit om bestellingen, boekingsaanvragen en afgeronde gesprekken te verwerken.
3. Importeer voor een Nederlands of ander internationaal nummer een telefoonnummer dat je beheert via Twilio in Vapi. Stel `VAPI_PHONE_NUMBER_ID` in om dit nummer automatisch aan de assistent te koppelen. Zonder deze waarde koppel je het nummer na het aanmaken in het Vapi-dashboard. Een geschikt telefoonnummer en Vapi-account zijn noodzakelijk voor echte inkomende gesprekken.
4. Maak in Vapi een headercredential aan die de header `x-vapi-secret` verstuurt met een willekeurige geheime waarde. Stel dezelfde waarde in als `VAPI_WEBHOOK_SECRET` en het credential-ID als `VAPI_WEBHOOK_CREDENTIAL_ID`. Zonder dit gedeelde geheim worden Vapi-webhooks geweigerd. Bewaar geheimen alleen in serverconfiguratie of Vapi-credentials.
5. Vul bedrijfsinformatie en aanbod in het dashboard in, sla alles op en kies **Assistent naar Vapi sturen**. De actie maakt de assistent aan of werkt de bestaande assistent bij.

De assistent gebruikt Gemini Flash, Deepgram-spraakherkenning in het Nederlands en de stem `nl-NL-ColetteNeural`. De interruptie-instellingen zijn gericht op direct luisteren wanneer een beller begint te spreken. Controleer in je Vapi-account of de gekozen modellen en stem voor je account beschikbaar zijn, en voer vóór livegang testgesprekken uit.

## Sms na een gesprek via n8n en Twilio

Vapi verzorgt de telefonie en de spraakagent; n8n verstuurt de sms via Twilio. Vapi zelf is geen sms-gateway.

1. Importeer `n8n-workflow.json` in je n8n-omgeving.
2. Maak een n8n **Header Auth**-credential met headernaam `x-workflow-secret` en dezelfde geheime waarde als `N8N_WEBHOOK_SECRET`; selecteer deze credential bij de webhooknode.
3. Maak of selecteer in n8n een Twilio-credential met de vereiste Account SID en Auth Token. Selecteer deze bij **Verstuur bevestiging per sms**.
4. Stel `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` en `N8N_SMS_FROM_NUMBER` in op de appserver. Het afzendernummer moet een actief, sms-geschikt Twilio-nummer in internationaal E.164-formaat zijn, zoals `+31201234567`.
5. Activeer het n8n-workflow en kopieer de **productie-webhook-URL** van **Gesprek afgerond** naar `N8N_WEBHOOK_URL`. Herstart de appserver.

Bij een afgerond Vapi-gesprek slaat de app het verslag op en stuurt het telefoonnummer, de samenvatting en het ingestelde sms-afzendernummer via de beveiligde webhook naar n8n. n8n controleert de nummers en samenvatting voordat Twilio de sms verstuurt.

Gebruik voor verbinding tussen services HTTPS. Een sms kan pas daadwerkelijk worden verzonden nadat de Twilio-credential, het afzendernummer, het actieve n8n-workflow en de vereiste accountmachtigingen zijn ingesteld. Controleer ook de landspecifieke regels voor sms en toestemming.

## Dashboard

- Overzicht met aantallen, bestelsom, recente bestellingen en gesprekssamenvattingen.
- Bestellingen aanmaken, aflevervoorkeuren registreren en de status bijwerken.
- Boekingen aanmaken en bekijken.
- Menu en prijzen beheren; de assistent noemt uitsluitend beschikbare items.
- Bedrijfsnaam, adres, openingsuren, bezorggebied en verwachte bereidingstijden instellen.
- Nederlandse Vapi-assistent aanmaken of bijwerken en gespreksrapporten ontvangen.

Bevestigde bestellingen uit telefoongesprekken worden met prijzen uit het actuele aanbod berekend en in het dashboard opgeslagen. Boekingen uit gesprekken worden als **aanvraag** opgeslagen; de assistent belooft niet dat er agenda- of capaciteitscontrole heeft plaatsgevonden en vertelt dat een medewerker de beschikbaarheid nog bevestigt.

## API en testen

- `GET /api/health` — serverstatus.
- `POST /api/auth/login`, `POST /api/auth/logout` — app-beheerde e-mail/wachtwoord-login.
- `GET /api/state`, `PUT /api/state` — dashboardgegevens lezen en bedrijfsinstellingen/aanbod opslaan; adminsessie vereist.
- `POST /api/orders`, `POST /api/bookings` — handmatige dashboardinvoer.
- `PATCH /api/orders/:id` — bestelstatus bijwerken.
- `POST /api/integrations/vapi/deploy` — Vapi-assistent aanmaken of bijwerken.
- `POST /api/webhooks/vapi` — afgeronde Vapi-gesprekken ontvangen en doorgeven aan n8n.

Voer de controles uit met `npm test`.

## Voor livegebruik

Plaats de server achter HTTPS, maak back-ups van de gegevens en configureer geheimen in je hostingplatform. Sessies zijn HttpOnly, SameSite en server-side opgeslagen. Gebruik een serveromgeving met één actieve Node-procesinstantie of voeg gedeelde sessieopslag toe voordat je horizontaal schaalt.
