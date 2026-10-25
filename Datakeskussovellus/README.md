# Datakeskukset ja sinä

Sovellus, jossa maskotti Kulma-Kullervo kertoo viidellä tärkeimmällä asialla per aihe, mitä datakeskukset tarkoittavat käyttäjälle.

Backendiä ei ole: kaikki toimii selaimessa. Paikkakunta ja ammatti kysytään, mutta sisältö on kovakoodattu. Profiileja on kaksi: jos paikkakunnaksi valitaan **Kuopio**, sisältö on kirjoitettu **kuopiolaisen opettajan** näkökulmasta, muuten **tamperelaisen rakennusmiehen** näkökulmasta. Jokaisen maskotin sanoman asian perässä on lähdepilleri, josta aukeaa lähdeluettelo.

## Käynnistys

`index.html` toimii suoraan tiedostona. Jos haluat sovelluksen myös lähiverkon puhelimeen:

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

Avaa sitten koneella http://localhost:8000 tai puhelimella http://<koneen-ip>:8000.

## Tiedostot

```
index.html   Näkymät: onboarding, aihealueet ja esitys
styles.css   Tyylit
app.js       Toimintalogiikka (reititys, kuntahaku, esitys, lähdepillerit)
content.js   Yhteinen sisältö (aiheet, värit, lähteet) ja Tampereen rakennusmiehen 5 kohtaa per aihe
content-kuopio.js  Kuopion opettajan 5 kohtaa per aihe ja Kuopion lähteet
kunnat.js    Suomen 308 kuntaa (Tilastokeskus, kunnat 2026)
assets/      Maskotin kuva (asento näkyy pienenä kallistuksena)
```

Sisältöä muokataan `content.js`:ssä. Jokaisella kohdalla on `sources`-lista, jonka avaimet viittaavat `SOURCES`-taulukkoon.
