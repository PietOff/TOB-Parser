/**
 * UBI-codes (Uniforme Bron Indeling) per activiteitomschrijving.
 *
 * Gegenereerd uit "ubi-lijst stedin.xlsx": tabblad UBI_3_0 (de actuele lijst,
 * leidend bij tegenstrijdigheden) aangevuld met UBI-zoeklijst (synoniemen en
 * oudere schrijfwijzen). 2507 omschrijvingen.
 *
 * De bodemrapportage van de Brabantse omgevingsdiensten noemt bij een
 * verontreinigende activiteit alleen de UBI-omschrijving, niet de code. Die
 * omschrijvingen komen letterlijk uit deze lijst, dus een exacte match op de
 * genormaliseerde tekst levert de code op die in §2.5 van de rapportage hoort.
 *
 * Regelformaat: <code>|<omschrijving>
 */
const UBI_LIJST = `\
315007|TL-buizenfabriek
34202|aanhangwagen- en opleggerfabriek
3420|aanhangwagen-, oplegger-, en carrosserie-industrie
501051|aanhangwagenreparatiebedrijf
51312|aardappelgroothandel
156203|aardappelmeelfabriek
1531|aardappelproductenfabriek
15311|aardappelsiroopfabriek
156203|aardappelvlokkenfabriek
262|aardewerk-/keramiekfabriek
262|aardewerkfabriek
2621|aardewerkindustrie
1120|aardgas- en aardolietoeleveringsbedrijf (exploratie en winning)
1110|aardgasexploratiebedrijf
1110|aardgaswinning
1120|aardgaswinningstoeleveringsbedrijf (exploratie)
1110|aardolie- en aardgasexploratie
1110|aardolie- en aardgaswinning
1110|aardolie- en aardgaswinning en exploratie
23|aardolie- en steenkolenproductenfabriek
23|aardolie- en steenkolenproductenindustrie
232|aardolieproductenfabriek
51513|aardolieproductengroothandel
23201|aardolieraffinaderij
232|aardolieverwerkende industrie
295602|aardolieverwerkende industrie machinefabrieken
1110|aardoliewinning
1110|aardoliewinning en aardgaswinning
1120|aardoliewinningstoeleveringsbedrijf (exploratie)
1110|aardolieëxploratiebedrijf
241462|absorptiekoolfabriek
314001|accumulatorenfabriek
314002|accumulatorenreparatiebedrijf
241101|acetyleenfabriek
40048|acetyleengasfabriek
241606|acrylamidefabriek
159501|advocaatfabriek
40047|aerogeengasfabriek
40047|aerogeengasfabriek (lichtgas uit lichte olie)
24662|aerosolafvulbedrjf
24662|aerosolfabriek (spuitbussen)
2463|aetherische oliënfabriek
90090|afgebroken gebouw (asbest verdacht)
232021|afgewerkte olie-verwerkingsinrichting
232021|afgewerkte olierecycling
631307|afgewerkte olietank (bovengronds)
631257|afgewerkte olietank (ingemetseld)
631267|afgewerkte olietank (ommuurd)
631247|afgewerkte olietank (ondergronds)
2913|afsluiters-, kleppen-, kranen-, ventielenfabrieken
900021|afvalinzamelingsbedrijf
900022|afvaloverslagbedrijf
515735|afvalstoffengroothandel
515735|afvalstoffengroothandel n.e.g.
900095|afvalverbrandingsinrichting
900023|afvalverwerkingsbedrijf
2923|afzuiginstallatiefabriek
731011|agrarische proefboerderij
731011|agrarische researchinstelling
2923|airco-apparatenfabriek
5121|akkerbouwproducten-, sierteeltproducten-, veevoeder- en meststoffengroothandel
512171|akkerbouwproductengroothandel
3320|alarminstallatiefabriek
159|alcoholfabrieken, distilleerderijen en likeurstokerijen
159|alcoholische drankenfabrieken, distilleerderijen en likeurstokerijen
241471|aluinfabriek
28111|aluminium productenfabriek
2742|aluminiumfabriek
275311|aluminiumgieterij
285122|aluminiumveredeling (anodiseren)
241312|ammoniakfabriek
284001|ankersmederij
2413|anorganische chemische grondstoffenfabriek
3231|antennebouwbedrijf
241227|anthrachinonkleurstoffenindustrie
515112|anthracietdrogerij
21211|apparaatrollenfabriek
29|apparatenfabriek
71342|apparatuurverhuurbedrijf
153203|appelsiroopfabriek
17305|appreteerderij
24665|appretstoffenfabriek
241307|arsenicumfabriek
2665|asbestcementwarenfabriek
26654|asbestpolijstinrichting
26652|asbestverwerkende fabriek
26653|asbestzagerij
268201|asfalt(beton)menginstallatie
268201|asfaltfabriek
268201|asfaltfabriek (bitumen)
268201|asfaltfabriek (koolteer)
268201|asfaltfabriek (ruwe aardolie)
268202|asfaltmastiekfabriek
268202|asfaltpapierfabriek
268201|asfaltproductenfabriek
2811|assemblagebedrijf (metaal)
3230|audiovisuele apparatenfabriek
3410|auto- en autobussenfabriek
51571|auto- en motorensloperij
3410|auto-assemblagebedrijf
502031|auto-electroreparatiebedrijf
3410|auto-industrie en assemblagebedrijven
50201|auto-onderdelen servicebedrijf
3430|auto-onderdelen- en accesoiresfabriek
3430|auto-onderdelenfabriek
50201|auto-onderdelenrevisiebedrijf
50201|auto-onderdelenservicebedrijf
24515|auto-onderhoudsmiddelenfabriek
25121|autobandencoveringsbedrijf
2511|autobandenfabriek
25121|autobandenreparatiebedrijf
50202|autobandenservicebedrijf
502043|autobeklederijen
60211|autobuslijndienst
6021|autobusonderneming
3410|autobussenfabriek
501033|autobussenreparatiebedrijf
60211|autobusstation -remise
5010|autodetailhandel (geen reparatie)
3410|autofabriek
285202|autogene lasinrichting
5010|autohandel (geen reparatie)
292403|automatenfabriek
291103|automotorenfabriek
632101|autoparkeer- en -stallingsbedrijf
632101|autoparkeerbedrijf
365021|autopedfabriek
502042|autoplaatwerkerij annex -spuiterij
501044|autoreparatiebedrijf
8041|autorijschool
261203|autoruitenfabriek
51571|autoshredder
51571|autosloperij
502041|autospuitbedrijf (geen plaatwerkerij)
632101|autostallingsbedrijf
7110|autoverhuurbedrijf
502053|autowasserij
631236|autowrakkenterrein
011214|azaleakwekerij
1587|azijn-, specerijen- en kruidenfabriek
241431|azijnessencefabriek
1587|azijnfabriek
1587|azijnmakerij
1587|azijnsstokerij
241442|azijnzuurfabriek
241225|azokleurstoffenfabriek
24121|azuurfabriek (blauwsel)
452314|baggerbedrijf
712202|baggermachineverhuurbedrijf
712202|baggermachineverhuurbedrijven (met bedienend personeel)
351101|baggermateriaalrevisiebedrijf
900015|baggerspeciedepot (op land)
3514|baggervaartuigenwerf
252401|bakelietenvoorwerpenfabriek
246661|bakelietfabriek
252401|bakelietvoorwerpenfabriek
15891|bakkerijgrondstoffenfabriek
292406|bakkerijmachinereparatiebedrijf
15891|bakmeel- en puddingpoederfabriek
2640|baksteen- en dakpannenindustrie
264001|baksteenfabriek
192005|ballenmakerij
2513|ballonnenfabriek
175401|band, -vlecht, passement- en kantfabrieken
50202|bandenservicebedrijf
175401|bandfabriek
292203|bandtransporteursfabriek
158201|banketfabriek
285201|bankwerkerij
332003|barometerfabriek
26663|basaltinetegelfabriek
27|basismetaalindustrie
2951|basismetaalindustriemachinefabriek
314003|batterijenfabriek
24691|beagidfabriek
3130|bedrukte bedradingfabriek
361502|bedverenzuivering
246401|beelddragers fabricage
246401|beelddragersfabriek
246223|beenderenontvettingsinrichting
631235|beenderenopslagplaats
246226|beendermalerij
246228|beenvetkokerij
246227|beenzwartbranderij
246227|beenzwartfabriek
2124|behangselpapierdrukkerij
2124|behangselpapierfabriek
2862|beitelfabriek
204004|bekistingenfabriek
231024|benzeenfabriek
5050|benzine-service-station
50511|benzinepomp eigen gebruik
292406|benzinepompenrevisiebedrijf
50511|benzinepompinstallatie
23201|benzineraffinaderij
631306|benzinetank (bovengronds)
631256|benzinetank (ingemetseld)
631266|benzinetank (ommuurd)
631246|benzinetank (ondergronds)
231024|benzolfabriek
24121|bergblauwfabriek
502052|bergingsbedrijf (voertuigen)
24121|berlijnsblauwfabriek
158202|beschuitfabriek
2863|beslagfabriek (metaal)
2861|bestekfabriek
2420|bestrijdingsmiddelen- en landbouwchemicaliënindustrie
2420|bestrijdingsmiddelenfabriek
515522|bestrijdingsmiddelengroothandel
515522|bestrijdingsmiddelenopslag
631298|bestrijdingsmiddelenopslagplaats
266|beton- en cementwarenindustrie
241224|betonemaillefabriek (kleurstof)
2663|betonfabriek
266403|betonmortelcentrale
26611|betonmortelspecieverwerkend bedrijf
3516|betonningsbedrijf
266301|betonspeciefabriek
26611|betonsteenfabriek
26611|betonwarenfabriek
3320|beveiligingsapparatenfabriek
2330|bewerking van splijt- en kweekstoffen
252203|bewikkelingstapefabricage
252203|bewikkelingstapefabriek
3662|bezemfabriek
1596|bierbrouwerij
3622|bijouteriemakerij
361602|biljartfabriek
26611|bimsbetonfabriek
22254|binderijen, brocheerderijen, en kantoorboekenfabriek
61201|binnenvaartbedrijf
24661|biochemische productenfabriek
158201|biscuit-, koek- en banketfabrieken
158201|biscuitfabriek
268201|bitumenasbestproductenfabriek
268202|bitumineus dakbeddekkingsmateriaalfabriek
268201|bitumineus wegenbouwmateriaalfabriek
27421|bladalluminiumfabriek
274312|bladtinfabriek
274312|bladtinfabriek (stanniol)
17302|blauwdrukkerij
24121|blauwe verfstoffenfabriek (minerale)
24121|blauwgeelfabriek
24121|blauwselfabriek
17301|blauwververij
241302|blauwzuurvervaardiging (vloeibaar)
241461|bleekaardefabriek
241321|bleekchloorfabricage
241321|bleekchloorfabriek
241324|bleekmiddelfabriek
241322|bleekwaterfabriek
287201|blikbewerkend bedrijf
287201|blikfabriek
454401|blikschildersbedrijf
3162|bliksemafleidermakerij
287202|blikslagerij
287201|blikwarenfabriek
151404|bloeddrogerij
24121|bloedloogzoutfabriek
011213|bloembollen- en bloemknollenkwekerij
014124|bloembollenontsmettingsbedrijf
014124|bloembollenprepareerbedrijf
014124|bloembolprepareer- en -ontsmettingsbedrijf
011214|bloemenkwekerij
011216|bloemzaadkwekerij
2020|boardplaat- of vezelplaatfabriek
284002|bodemforceerbedrijf
73106|bodemkundig laboratorium
22254|boekbinderij
22254|boekbinderijen, brocheerderijen
22221|boekdrukkerij
24515|boenwasfabriek
287503|bogenfabriek (metaal)
152003|bokkingrokerij (groot)
17304|bombazijnblekerij
909001|bominslag/-krater
183002|bontkledingfabriek
183003|bontwerkerij of -pelterij
287503|boodschappenkarrenfabricage
0113|boomgaard
01122|boomkwekerij
241426|boraxraffinaderij
241426|boraxstokerij
212202|bordpapierfabriek
182403|borduur- en plisseerwerk, kledingverwantebedrijven
182403|borduurbedrijf
3662|borstelfabriek
3662|borstelmakerij
3662|borstelwaren- en bezemfabriek
241222|boter- en kaaskleurselfabriek
1599|bottelarij
287401|bouten-, schroeven- en moerenfabriek
287401|boutenfabriek (gedraaide)
287401|boutenfabriek (gestampte)
515736|bouw- en sloopafvalhandel
900037|bouwafvalstortplaats
452111|bouwbedrijf
2523|bouwelementenbekledingsbedrijf
453|bouwinstallatiebedrijven
7132|bouwmachine- en -werktuigenverhuurbedrijf
292406|bouwmachinereparatiebedrijf
7132|bouwmachineverhuurbedrijf
26|bouwmaterialen-, aardewerk- en glasindustrie
266|bouwmaterialenfabriek
2630|bouwmaterialenfabriek (keramische)
295202|bouwmaterialenmachinefabriek
45|bouwnijverheid
295202|bouwnijverheidmachinefabriek
631306|bovengrondse benzine-opslagplaats
631300|bovengrondse brandstoffenopslagplaats
631302|bovengrondse hbo-tank
631300|bovengrondse k-0 tank
631300|bovengrondse olietank
631304|bovengrondse petroleumtank
24663|brandbluspoederfabriek
1591|brandewijnstokerij
287501|brandkasten-, safes, muurlokettenfabriek
287501|brandkastenfabriek
291203|brandspuitenfabriek
526333|brandstoffendetailhandel
526334|brandstoffendetailhandel (vast)
526333|brandstoffendetailhandel (vaste en vloeibare)
526335|brandstoffendetailhandel (vloeibaar)
51511|brandstoffengroothandel (vast)
515121|brandstoffengroothandel (vloeibaar)
631300|brandstoftank (bovengronds)
631250|brandstoftank (ingemetseld)
631260|brandstoftank (ommuurd)
631240|brandstoftank (ondergronds)
7525|brandweerkazerne
351801|breeuwbedrijf
1760|breifabriek
1716|breigarenfabriek
24121|bremergroenfabriek
231028|brikettenfabriek (houtskool)
231028|brikettenfabriek/houtskoolbranderij
264001|brikkenbakkerij
22254|brocheerderij
011218|broeikas
7124|bromfiets- en scooterverhuurbedrijf
7124|bromfietsenverhuurbedrijf
452542|bronbemalingsbedrijf
27453|bronsfabriek
275403|bronsgieterij
1581|broodfabriek
24173|budylrubberfabriek
2862|builenmakerij
264004|buizenfabriek (bakkerij)
45213|buizenleggersbedrijf
501034|bulldozer- en graafmachinereparatiebedrijf
501034|bulldozers onderhoudsbedrijf
452111|burgerlijk- en utiliteitsbouwbedrijf
246111|buskruitfabriek
246112|buskruitmolen
287201|bussenfabriek (blik)
15841|cacaofabriek
285108|cadmeerinrichting
241427|caffeïnefabriek
1586|caffeïnevrije koffiefabriek
24172|caoutchoucfabriek
24702|caprolactamfabriek (kunstzijde/rayon)
24702|caprolactamfabriek (nylon)
287104|capsulenfabriek
34203|caravanfabriek
501052|caravanreparatiebedrijf
241315|carbidfabriek
231|carbochemische industrie (teer)
231026|carbolineumfabriek
231043|carbon-blackfabriek
231042|carbonpapierfabriek
241318|carbonzuurfabriek (synthetisch)
50514|carburinepompinstallatie
24121|carminbereiderij (rode kleurstof=karmijn)
34201|carrosseriefabriek
241611|caseïne-/kunsthoornfabriek
241611|caseïnefabriek
222283|cellophaanbekleding drukwerk
2530|celluloid-verwerkingsbedrijf
25301|celluloide-voorwerpenfabriek
2530|celluloidfabriek
211201|cellulosefabriek
265|cement-, kalk- en gipsindustrie
2651|cementfabriek
265115|cementmolen
26661|cementsteenfabriek
2822|centrale verwarmingsketelfabriek
26301|chamottefabriek (vuurvaste stenen)
011212|champignon-/paddestoelenkwekerij
011212|champignonkwekerij
515|chemicaliën-, olien-, vetten- en rubbergroothandel
241|chemicaliënfabriek
51551|chemicaliëngroothandel (industrie)
631280|chemicaliënopslagplaats
222278|chemigrafisch bedrijf
222278|chemigrafische en fotolithografische bedrijven
24|chemisch bedrijf
73104|chemisch laboratorium
930128|chemisch reinigingsbedrijf
900027|chemische afvalstoffenopslag
900027|chemische afvalstoffenopslag/kca-depot
51551|chemische grondstoffen en chemicaliëngroothandel
51551|chemische grondstoffengroothandel
241|chemische grondstoffenindustrie
24|chemische industrie
2467|chemische kantoorbenodigdheden-fabrieken
24|chemische productenfabriek
295403|chemische reinigingsapparatenfabriek
930120|chemische stomerij
930127|chemische ververij
930120|chemische wasserij
930120|chemische wasserij/stomerij
331023|chirurgische instrumentenfabriek
24132|chloorfabriek
24175|chloropreenrubberfabriek
158421|chocoladefabriek
241215|chromaatverfstoffenfabriek
241215|chroomverfstoffenfabriek
1594|cider- en vruchtenwijnenfabriek
285201|ciseleerbedrijf
747022|classificeerbedrijf
22252|cliché-drukkerij
22252|cliché-inrichting (koper en zink)
222278|cliché-platenfabriek
222278|cliché-platenfabriek/chemigrafisch bedrijf
175101|cocosmattenfabriek
515111|cokes- en kolenbreek- en sorteerinrichting (zifterij)
515111|cokesbreekinrichting
23101|cokesfabriek
2310|cokesfabrieken en teerdestilleerderijen
515111|cokeszifterij
246503|compact-disk fabriek
900026|composteringsbedrijf
291201|compressorenfabriek
3002|computerfabriek
3002|computerfabriek (incl. randapparatuur)
3002|computerinstallatiebedrijf
725001|computerreparatiebedrijf
3210|condensatorenfabriek
1533|confiturenfabriek
2811|constructiewerkplaats
1552|consumptie-ijsfabriek
712103|container-, oplegger- en aanhangwagenverhuurbedrijf
712103|containerbedrijf
2879|containerfabricage en -reparatiebedrijf
2879|containerfabriek
631113|containeroverslagbedrijf
747024|containerreinigingsbedrijf (incl. drumcleaning)
2879|containerreparatiebedrijf
712103|containerverhuurbedrijf
2452|cosmeticafabriek
244211|cremotartanfabriek (wijnsteen laxeermiddel)
231030|creolinefabriek (desinfecterend middel uit creosoot)
231025|creosootfabriek
201021|creosoteerinrichting
45231|cultuurtechnisch bedrijf
45332|cv- en luchtbehandelingsapparatuurinstallatiebedrijf
45332|cv- en luchtbehandelingsapparatuurinstallatiebedrijff
285203|cylinderslijperij
268202|dakbedekkingsmateriaalfabriek
4522|dakdekkersbedrijf
264002|dakpannenfabriek
151402|darmenslijmerij, -wasserij en -zouterij
1585|deegwarenfabrieken
7522|defensieterrein
174001|dekenstikkerijen, spreienfabrieken e.d.
930123|dekenwasserij
174002|dekkledenfabriek
900060|demping (niet gespecificeerd)
900066|demping met agrarisch afval en/of takkenbossen
900063|demping met baggerspecie
900069|demping met grond
900064|demping met houtafval
900062|demping met huishoudelijk afval
900061|demping met industrieel- en bedrijfsafval
900065|demping met lompen
900067|demping met puin en/of bouw- en sloopafval
1591|destilleerderij en likeurstokerij
246221|destructiebedrijf
5010|detailhandel in auto's, rijwielen, e.d.
2812|deuren- en kozijnenfabriek (metaal)
2812|deurenfabriek (stalen en non-ferro)
24121|deventergroenfabriek
156202|dextrinefabriek
241607|diakon- en perspexfabriek
241607|diakonfabriek
362202|diamant-, goud- en zilververwerkende industrie
362201|diamantslijperij
222291|diep-/plaatdrukkerij
222291|diepdrukkerij
284002|dieptrekbedrijf
15131|diepvriesmaaltijdenfabriek
73109|diergeneeskundig laboratorium
24423|diergeneesmiddelenfabricage
24423|diergeneesmiddelenfabriek
154109|dierlijke olie- en vettenfabriek
154109|dierlijke oliën- en vettenfabriek
51216|dierlijke oliën- en vettengroothandel
157|diervoederindustrie
50201|diesel-remservicebedrijf
291101|dieselmotorenfabriek
50512|dieselpompinstallatie
631301|dieseltank (bovengronds)
631251|dieseltank (ingemetseld)
631261|dieseltank (ommuurd)
631241|dieseltank (ondergronds)
1591|distilleerderij en likeurstokerij
631122|distributiecentrum
5246|doe-het-zelf winkel
17301|doekenververij
21211|dozenmakerij
2734|draadfabriek (metaal)
287302|draadnagelfabriek
2873|draadproductenfabriek (metaal)
2873|draadproduktenfabriek(metaal)
2734|draadtrekkerij (metaal)
2734|draadtrekkerij uit ijzer en staal
264004|draineerbuizenbakkerij
192003|drijfriemenfabriek (leer)
2513|drijfriemenfabriek (rubber)
2914|drijfwerkelementenfabriek
2722|drinkwaterleidingenfabriek
2923|droogapparatenfabriek
351104|droogdok (scheepsreparatie)
24304|drukinktfabriek
2222|drukkerij (algemeen)
222|drukkerijen en aanverwante activiteiten
747024|drum-cleaning
930120|dry-cleaning
332007|duikapparatuuronderhoudsbedrijf
61203|duwvaartbedrijf
311005|dynamofabriek
2452|eau de colognefabriek
241323|eau de tavellesfabriek (bleekmiddel)
362202|edelsmederij
2513|elastiekfabriek
400010|electriciteitsproductie en -distributiebedrijf
400021|elektriciteitscentrale
400010|elektriciteitsdistributiebedrijf
400010|elektriciteitsproductiebedrijf
400012|elektrisch onderstation (transformatorolie)
315001|elektrische (gloei-)lampenfabriek
31|elektrische apparatenfabriek
2971|elektrische apparatenfabriek (huishoudelijk)
3162|elektrische benodigdhedenfabriek n.e.g.
3130|elektrische draad- en kabelfabriek
3150|elektrische lampen en buizen en verlichtingsbenodigdhedenfabriek
315001|elektrische lampenfabriek
31|elektrische machine- en apparatenindustrie
2971|elektrische verwarmingsapparatenfabriek
287201|elektro-blikfabriek
3110|elektromotoren-, generatoren- en transformatorenfabrieken
311001|elektromotorenfabriek
311006|elektromotorenreparatiebedrijf
2971|elektronische apparatenfabriek
3210|elektronische componentenmateriaalfabriek
31|elektronische industrie
3210|elektronische installatiemateriaalfabriek
3320|elektronische meet-, regel- en controle-apparatenfabriek
453101|elektrotechnisch installatiebedrijf
3120|elektrotechnisch installatiemateriaalfabriek
2971|elektrotechnische apparatenfabriek
3162|elektrotechnische fabriek
274311|elektrotinfabriek
24421|elixermakerij
246664|emailleerfabriek
285112|emailwerkerij
287201|emballagefabriek (blik)
205101|encadreerinrichting
2123|enveloppen- en school- en kantoorbenodigdhedenfabrieken
212301|enveloppenfabriek
2526|epoxy- en polyesterspuiterij
241604|epoxyharsfabriek
900080|erfverharding (niet gespecificeerd)
900085|erfverharding met baggerspecie
900089|erfverharding met grond
900084|erfverharding met houtafval
900083|erfverharding met kolengruis en/of sintels
900087|erfverharding met puin en/of bouw en sloopafval
900081|erfverharding met slakken
900082|erfverharding met zinkassen
631111|ertsen- en mineralenoverslagbedrijf
51521|ertsenhandel
24143|essencemakerij
241313|etherfabriek
241422|ethylacetaatfabriek (oplosmiddel)
212501|etiketten- en stickersfabriek
222241|etikettendrukkerij
212501|etikettenfabriek
285124|etserij
151101|exportslachterij
900035|faecaliënstortplaats
262101|faiencefabriek (fijn aardewerk)
24411|farmaceutisch laboratorium
2442|farmaceutische artikelenfabriek
2441|farmaceutische grondstoffenfabriek
2442|farmaceutische productenfabriek
2442|farmaceutische produktenfabriek
51486|fietsen- en bromfietsengroothandel
504|fietsen-, bromfietsen- en motorfietsenbedrijf
3542|fietsenfabriek
262101|fijnaardewerk- en porseleinfabriek
202002|fineerfabriek
201012|fineerzagerij
45331|fitters- en sanitairinstallatiebedrijf
287103|flessen- en ringenfabriek
261301|flessenfabriek
747027|flessenspoelinrichting
287102|flessluitingenfabriek (metaal)
241314|fluorwaterstoffenfabriek
261205|foeliefabriek
261205|foelieslagerij
261205|folie- of foeliefabriek (bladmetaal voor op spiegels)
261205|foliefabriek
284002|forceerbedrijf
241317|formaldehydefabriek
241317|formaldehydefabriek (sterkwater)
74813|foto- en filmlaboratorium
74813|foto- en filmontwikkelcentrale
74811|foto-ateliers (alleen grootschalig)
246665|foto-emaillefabriek
2464|fotochemische productenfabriek
2464|fotochemische produkten-fabriek
222285|fotodrukbedrijf
74811|fotografisch bedrijf
222403|fotografische zetterij
222277|fotolithografisch bedrijf
334001|fototechnische en optische industrie
354403|framebouwerij
262101|friesch aardewerkfabriek
24121|frieschgroenfabriek
1598|frisdranken- en mineraalwaterfabriek
1598|frisdrankenfabriek
0113|fruitkwekerij
0113|fruitkwekerij/boomgaard
0113|fruitteelt
1533|fruitverwerkende fabriek
45251|funderingtechnisch bedrijf
2871|fustenfabriek (metalen)
24424|gaasdoekfabriek
17301|gaasververij
175401|galonfabriek
285105|galvaniseerinrichting
501044|garagebedrijf
241216|garancinefabriek
192002|gareel- of haammakerij
17304|garenblekerij
1716|garentwijnderij
17301|garenververij
152001|garnalendrogerij
45331|gas- en waterfittersbedrijf
1110|gasbehandelingsinstallatie
400015|gasdrukregel- en meetstation
4004|gasfabriek
24692|gasgloeikousjesfabriek
51551|gassen-/zurenhandel
1760|gebreide en gehaakte stoffenfabriek (tricot)
275404|geelgieterij
246225|gelatinefabriek
153202|geleifabriek
31109|gelijkrichtersinrichting
246501|geluidsbandenfabriek
452315|gemeentelijke, provinciale en rijkswerkplaatsen (weg- en waterbouw)
4542|gemeentetimmerwerkplaats
2442|genees- en verbandmiddelenindustrie
24421|geneesmiddelenfabriek
311003|generatorenfabriek
203022|geprefabriceerde gebouwenfabriek (hout)
2862|gereedschappenfabriek
285203|gereedschapslijperij
2940|gereedschapswerktuigenfabriek
275421|geschutgieterij
286303|gespenfabriek
286303|gespenmakerij
174002|geteerd zeildoekmakerij
296001|geweerherstellersbedrijf
296001|geweerladenfabriek
296001|geweerlopenfabriek
296001|geweermakerij
275412|gewichtenmakerij
297201|geëmailleerde huishoudelijke apparatenfabriek
297201|geëmailleerde ijzerwarenfabriek
275|gieterijen/smelterijen
2721|gietijzeren buizenfabriek
2653|gipsbranderij
2662|gipsenbeeldenfabriek
2653|gipsfabriek
2662|gipsgieterij
2662|gipsproductenfabriek
1592|gist- en spiritusfabriek
363004|gitaarbouwbedrijf
191024|glacéleerlooierij
261|glas- en glaswerkindustrie
241608|glas-harslaminaatfabriek
261201|glas-in-koperzetterij
261201|glas-in-loodfabriek
261201|glas-in-loodzetterij
261202|glasbewerkingsbedrijf (vlakglas)
2615|glasbewerkingsinrichting
2613|glasblazerij
2613|glasbranderij
261202|glascoating verwerkingsbedrijf
2613|glasetserij
2611|glasfabriek (bouwglas)
261301|glasfabriek (emballage)
261301|glasfabriek (emballage, flessen)
2613|glasfabriek (holglas, glasblazerij)
261302|glasfabriek (huishoudelijk glaswerk, glazen)
2611|glasfabriek (vlakglas)
2613|glasgieterij
261202|glashardingsbedrijf
261|glasindustrie- en bewerkingsinrichtigen
261202|glasplatenstraalbedrijf
2615|glasproduktenfabriek
2613|glasslijperij
261202|glassnijderij
26151|glasstenenfabriek
011217|glastuinbouw
261202|glasveredelingsbedrijf
2615|glasverwerkende industrie
261206|glasverzilveringsbedrijf
2614|glasvezelfabriek
2614|glasvezelpolyesterproductie
4544|glaszettersbedrijf
241428|glauberzoutfabriek
261302|glazenmakerij
2627|glazuurderij
246662|glazuurfabriek
2627|glazuurmolen (malen van sillicaten voor aardewerk)
246663|gloedfabriek
246663|gloedstokerij
315004|gloeidraadfabriek
315001|gloeilampenfabriek
3150|gloeilampenfittingfabriek
156202|glucose- en dextrinefabrieken
156202|glucosefabriek
6312|goederenopslagplaats
6024|goederenwegvervoer
21212|golfkartonfabriek
21212|golfpapier- en golfkartonfabriek
287707|golfplatenbewerkingsbedrijf
2462|gomfabriek
287502|gordijnrailfabriek
156102|gort- en rijstpellerijen
156102|gort- en rijstpellerijen, havermoutfabriek en overige grutterswarenfabriek
362202|goud- en zilversmederij
362202|goudbranderij
24121|goudbronsfabriek
222295|gouddiepdrukdrukkerijen
287304|gouddraadtrekkerij
362202|gouddrijverij
362202|goudslagerij
501034|graafmachinereparatiebedrijf
156101|graanmalerij
2953|graanverwerkendemachines-fabriek
2223|grafische afwerkcentrale
51554|grafische artikelengroothandel
222|grafische industrie
22|grafische industrie, uitgeverijen
205102|grafkistenfabriek
246504|grammofoonplatenfabriek
512111|granengroothandel
26662|granieten aanrechtenfabriek
26662|granietfabriek
26662|granietproduktenfabriek
014125|grasdrogerij (tanks)
292406|grasmaaierreparatiebedrijf
285203|graveerbedrijf
17301|greinververij
265118|grintbreekinrichting
26811|gritfabriek
285203|gritstraalinrichting
24121|groenfabriek
293202|groenonderhoudmachineswerkplaats
1533|groente- en fruitconservenfabriek
1533|groente- en fruitverwerkend bedrijf
153|groente- en fruitverwerkende industrie
1533|groente-inmakerij
1533|groentedrogerij
011211|groentekwekerij
011211|groentenkwekerij
1533|groenteverduurzamingsfabriek
1533|groenteverwerkende fabriek
01411|groenvoorziening
6023|groepsvervoer- en touringcarbedrijf
6023|groepsvervoerbedrijf
264003|grof aardewerk-fabriek (excl.tegels)
284001|grof- en scheepssmederij
284001|grofsmederij
284|grofsmederij, stamp- en persbedrijf
452542|grond- en putboorbedrijf
452542|grond- en putboorderijen en bronbemalingsbedrijven
45231|grond-, water- en wegenbouwkundige bedrijven
900092|gronddepot (vervuilde grond)
900092|grondepot (vervuilde grond)
014123|grondontsmettingsbedrijf
900039|grondopslagplaats
7132|grondverzetmachine verhuurbedrijf
292406|grondverzetmachinereparatiebedrijf
452313|grondwerken bedrijf
452313|grondwerkenbedrijf
51572|groothandel in schroot en afvalstoffen
2953|grootkeukeninstallatiesfabriek
156102|grutterswarenfabriek
152009|guaninefabriek
2513|gummiwarenfabriek
24171|guttaperchafabriek
297202|haardenfabriek
297202|haardenmakerij
297202|haardensmederij
175101|haarkledenfabriek
24421|haarlemmeroliefabriek
201026|haarpuiskokerij
512414|haarververij
512414|haarvlechterij
2452|haarwaterfabriek
512414|haarwerkerij
275407|hagelgieterij
2863|hakenmakerij
366325|halffabrikatenveredelingsbedrijf
1716|handbreigarenfabriek
222261|handelsdrukkerij
2862|handgereedschappenfabriek
192008|handschoenmakerij (leer)
930124|handschoenwasserij
2863|hang- en sluitwerkfabriek
203021|hardhoutenvloerenfabriek
152005|haringinleggerij
243012|harsstokerij
156102|havermoutfabriek
631302|hbo-tank (bovengronds)
631252|hbo-tank (ingemetseld)
631262|hbo-tank (ommuurd)
631242|hbo-tank (ondergronds)
2922|hef- e.a. transportwerktuigenindustrie
292204|heftrucks-/interne transportmiddelenreparatiebedrijf
292204|heftrucksreparatiebedrijf
452511|heibedrijf
292406|heimachinereparatiebedrijf
2862|hekelmakerij
286301|hekwerkfabriek (metaal)
2922|hijs-, hef- en andere transportmiddelenindustrie
182404|hoeden- en pettenfabriek
930122|hoedenschoonmakerij
17301|hoedenververij
930122|hoedenwasserij
287505|hoefijzerfabriek
287503|hoepelbuigerij (metaal)
287503|hoepelfabriek (metaal)
222286|hoogdrukkerij
400011|hoogspanningskabel (oliedrukkabel)
51531|hout- en plaatmateriaalhandel
201012|hout- en plaatmateriaalzagerij
201024|hout-lakspuiterij
201024|hout-verfspuiterij
20|houtbe- en -verwerkende industrie
231023|houtbeschermingsproductenfabriek
292406|houtbewerkingsmachinereparatiebedrijf
20102|houtconserveringsbedrijf
231023|houtconserveringsmiddelenfabriek
201027|houtdraaierij
2040|houtemballagefabriek
2040|houten emballage-industrie
203024|houtenpanelen- en scheidingswandenfabriek
40044|houtgasfabriek
51531|houthandel (grootschalig)
2957|houtindustriemachinesfabriek
201011|houtmeel-, houtwol- en houtvezelfabrieken
3616|houtmeubelfabriek
203024|houtpanelen- en scheidingswandenfabriek
231028|houtskoolbranderij
231022|houtteerdestilleerderij
20|houtverwerkend bedrijf
205103|houtwarenfabrieken n.e.g.
2051|houtwarenindustrie
2051|houtwarenproduktenbedrijf
202005|houtwolplaatfabriek
201012|houtzaagmolen
201012|houtzagerij (grootschalig)
01411|hoveniersbedrijf
512415|huiden op- en overslag
51241|huiden- en vellengroothandel
512410|huidenbewerkingsinrichting
512412|huidendrogerij
512413|huidenzouterij
526333|huisbrandstoffendetailhandel
174001|huishoud- en wonigtextielfabriek
2971|huishoudelijke apparatenfabriek (electrische)
2971|huishoudelijke apparatenfabriek (elektrische)
2972|huishoudelijke apparatenfabriek (niet-electrische)
287502|huishoudelijke artikelenfabriek
287502|huishoudelijke metaalwarenfabriek
2525|huishoudelijke plastics fabriek
292406|huishoudmachinereparatiebedrijf
2971|huishoudmachinesfabriek
292205|hydraulische deurenfabriek
295203|hydraulische graafmachines-fabriek
292205|hydraulische installaties-fabriek
1552|ijsfabriek
273|ijzer- en staalverwerking (primair)
2734|ijzerdraadtrekkerij
287401|ijzerdraaierij
2751|ijzergieterij
284004|ijzerpletterij
287706|ijzerslagerij
2751|ijzersmelterij
241221|indigofabriek
366326|industriemolen (papier, verf, etc)
2411|industriële gassenfabriek
631256|ingemetselde benzinetank
631250|ingemetselde brandstoftank
631251|ingemetselde dieseltank
631252|ingemetselde hbo-tank
631254|ingemetselde petroleumtank
631258|ingemetselde smeerolietank
631255|ingemetselde stookolietank
631257|ingemetselde terpentijntank
631259|ingemetselde vluchtige productentank
334001|instrumenten- en optische industrie
332001|instrumentenmakerij
285203|instrumentenslijperij
292204|interne transportmiddelenonderhoudsbedrijf
292204|interne transportmiddelenreparatiebedrijf
3543|invalidewagensfabriek en -reparatiebedrijf
4532|isolatiebedrijf
268204|isolatiebuizenproductiebedrijf
268204|isolatiemateriaalfabriek
3130|isolatieplaatwerkerij
24121|ivoorzwartbranderij (zwarte verfstof)
926331|jachthaven
3512|jachtwerf (nieuwbouw- en reparatie na 1945)
205104|jaloezieën en markiezenmakerij (hout)
28111|jaloezieënfabriek (metaal)
205104|jaloezieënmakerij (hout)
174007|jaloezieënmakerij (textiel)
153202|jamfabriek
1591|jeneverdestilleerderij
1591|jeneverstokerij
171701|jutebewerking en -spinnerij
171701|jutespinnerij
17301|juteververij
172501|juteweverij
2862|kaardenmakerij
246811|kaarsenfabriek
246811|kaarsenmakerij
15511|kaasfabriek
246222|kaasstremselfabriek
45213|kabel- en buizenleggersbedrijven
371001|kabelbranderij
45213|kabelleggersbedrijf
297202|kachel- en haardenfabriek
297202|kachelfabriek
24515|kachelglansfabriek
297202|kachelmakerij
287504|kachelpijpenmakerij
297202|kachelsmederij
24515|kachelzwartfabriek
24153|kalisalpeterfabriek
241308|kaliumcarbonaat- potasbranderij
265201|kalkblusserij
265202|kalkbranderij
2652|kalkfabriek
265204|kalkmolen
266404|kalkmortelfabriek
265203|kalkoven/kalkashuis
26612|kalkzandsteenfabriek
501044|kampeerautoreparatiebedrijf
175401|kantfabriek
2123|kantoorbenodigdhedenfabriek (papier)
22255|kantoorboekenfabriek
725002|kantoormachine-installatiebedrijven (excl computers)
3001|kantoormachinefabriek
725002|kantoormachinereparatiebedrijf
361503|kapokzuivering
21211|kartonnagefabriek
452113|kassenbouw (metaalconstructies)
011218|kassenteelt
212203|kastrandenfabriek (papier)
17|katoen-, rayon- en linnenindustrie
1711|katoenbewerking en -spinnerij
17304|katoenblekerij
17302|katoendrukkerij
1711|katoenindustrie (grootschalig/alle activiteiten)
1711|katoenspinnerij
1711|katoenspoelerij
171101|katoentwijnerij
17301|katoenververij
1711|katoenvezelbewerkende fabrieken
930110|katoenwasserij
1721|katoenweverij
900027|kca-depot
262|keramiekfabriek
262102|keramisch atelier
2630|keramische tegels-, plavuizen- en estrikkenfabriek
2330|kerncentrale
2822|ketel- en radiatorenfabrieken
747022|ketelbikker
28302|ketelboeterij (reparatie)
2462|ketelkitfabriek
287402|kettingen- en verenfabriek
284001|kettingfabriek
2972|keukenartikelenfabriek
2523|keukenfabriek (kunststof)
014127|ki-station (kunstmatige inseminatie)
366323|kinderwagenfabriek
24421|kininefabriek
24421|kininemalerij
265205|kippengrit/schelpmalerij
204002|kistenfabriek
204002|kistenmakerij
2462|kitfabriek
362202|klatergoudklopperij
17304|kledingblekerij
18|kledingfabriek
18|kledingindustrie
295401|kledingindustrie-machinefabriek
17301|kledingververij
182403|kledingverwantbedrijf
2462|kleefstoffenfabriek
926239|kleiduivenschietbaan
900027|klein chemisch afvaldepot
2630|kleiwarenfabriek (tegels)
2412|kleur- en verfstoffenindustrie
24121|kleur- en verfstoffenindustrie 19e eeuw
24122|kleur- en verfstoffenindustrie 20e eeuw
2412|kleurselfabriek
2412|kleurstoffenfabriek
241220|kleurvlokkenfabriek
287401|klinknagelsfabriek (gestampte)
3350|klokken- uurwerkindustrie
3350|klokkenfabriek
275401|klokkengieterij
205105|klompenmakerij
999926|klusjesbedrijf
452112|klusjesbedrijf/uitvinder
2615|knikkerfabriek (glas)
275411|knopendraaierij (metaal)
275411|knopenfabriek
275411|knopenfabriek (metaal)
512414|koeharenfabriek
158201|koekfabriek
2923|koel- en droogapparatenfabrieken en -installatiebedrijven
51516|koel- en snijvloeistoffenhandel (minerale)
516|koel- en vriestechniekmachinesgroothandel
297105|koel- vriesmeubelenfabricage
297105|koel- vriesmeubelenfabriek
2923|koelapparatenfabriek
631222|koelinstallatie (ijsbaan)
292406|koelmachinerevisiebedrijf
631221|koelpakhuis
292406|koeltechnisch reparatiebedrijf
2923|koeltechnische installatiefabriek
631221|koelveem
64122|koeriersdienst
2524|kofferfabriek (kunststof)
192007|kofferfabriek (leer)
1586|koffiebranderij en theepakkerij
275407|kogelgieterij
175101|kokos-, sisal- en vloermattenindustrie
175101|kokosweverij
631234|kolenberging
515111|kolenbreker transportinrichting
526334|kolendetailhandel
14501|kolenmijnbouwbedrijf
631233|kolenopslag en -overslag
631233|kolenopslag- en -overslagplaats
631234|kolenopslagplaats
631234|kolenopslagplaats (berging)
631112|kolenoverslagbedrijf
515111|kolenzifterij
332004|kompasfabriek
332004|kompasmakerij
287503|kooienmakerij
2972|kookapparatenfabriek (excl. electrisch)
241462|koolborstelfabriek
231021|koolteerdestilleerderij
231021|koolteerfabriek
1752|koordfabriek (touwen)
287601|koper- en blikslagerij
2734|koperdraadtrekkerij
287602|koperdraaierij
222292|koperdrukkerij
284006|koperforceerbedrijf
275404|kopergieterij
362203|koperkunstatelier
275405|kopermolen
275405|kopermolen (tot 1850)
275406|koperplaatjesfabriek
275406|koperplaatjesfabriek (gieterij en pletterij)
284003|koperpletterij
287603|koperroodfabriek
287601|koperslagerij
287401|koperspijkermakerij
241305|kopersulfaatvervaardiging
287603|koperwarenfabriek
222262|kopieerinrichting
1591|korenwijnstokerij
2452|kosmetica-industrie
2732|koudbandwalserij
2732|koudgewalste en koudgezette profielen-fabriek
2731|koudtrekkerij van ijzer en staal
2732|koudwalserij van bandstaal
273|koudwalserijen en draadtrekkerij
25123|koudzoolfabricage
25123|koudzoolfabriek
1771|kousen- en sokkenfabriek
291101|krachtwerktuigenfabriek
2221|krantendrukkerij
747028|krattenwasinrichting
2615|kristalfabriek
2615|kristalslijperij
2615|kristalsnijderij
241423|kristalsodafabriek
204001|kuiperij
19101|kuipleerlooierij
241441|kunstazijnfabriek (acetaat)
2525|kunstbloemenfabriek
1543|kunstboterfabriek
2524|kunstdarmenfabriek
26665|kunstgranietfabriek
241601|kunstharsfabriek
241611|kunsthoornfabriek
241611|kunsthoornverwerkend bedrijf
1552|kunstijsfabriek
246813|kunstkaarsenmakerij
246813|kunstkaarsenmakerij (kleinschalig)
19106|kunstlederfabriek
26666|kunstmarmerfabriek
2470|kunstmatige garenfabriek
2470|kunstmatige vezelfabriek
2470|kunstmatige- en synthetische garen- en vezelindustrie
2470|kunstmatige- en synthetische garen- en vezelindustrie (rayon)
24151|kunstmestbewerkingsinrichting
2415|kunstmeststoffenfabriek
2415|kunstmeststoffenindustrie
2524|kunstoflijstenmakerij
252|kunstofproduktenindustrie
2523|kunststof meubelenfabriek
2523|kunststofbouwproductenindustrie
2416|kunststoffenfabricage
241611|kunststoffenfabriek
2522|kunststofverpakkingsindustrie
252|kunststofverwerkende fabriek
265114|kunsttrasmakerij
24612|kunstvuurwerkfabriek
171203|kunstwolfabriek
24702|kunstzijdefabriek (caprolactam)
24701|kunstzijdefabriek (viscose)
268205|kurkisolatiematerialenfabriek
268205|kurkplatenperserij
205201|kurksteenfabriek
205201|kurkwarenfabriek
513121|kwikafvalwater opslag
515231|kwikgroothandel
201022|kyaniseerinrichting
631110|laad- los- en overslagbedrijf (zeevaart)
631121|laad- los-, op- en overslagbedrijf (binnenvaart)
631110|laad-, los- en overslagbedrijf (zeevaart)
631121|laad-, los-, op- en overslagbedrijf (binnenvaart)
631122|laad-, los-, op- en overslagbedrijf (goederen)
712102|laadbakkenverhuurbedrijf
73104|laboratorium
291403|lagerfabriek
17301|lakenververij
24302|lakfabriek
24121|lakmoesfabriek
285132|lakspuiterij
243021|lakstokerij
175403|lampenkousjesfabriek
175403|lampepittenfabriek
7522|land-, zee- en luchtmacht
512|landbouwartikelengroothandel
2420|landbouwchemicaliënindustrie
2862|landbouwgereedschappenfabriek
2862|landbouwgereedschappenreparatiebedrijf
293201|landbouwmachinefabriek
293202|landbouwmachinereparatiebedrijf
7131|landbouwmachineverhuurbedrijf
293202|landbouwmechanisatiebedrijf
5121|landbouwproductengroothandel
014122|landbouwspuitbedrijf
293201|landbouwwerktuigenfabriek
752201|landmachtbasis
2940|lasapparatuurfabriek
2940|lasapparatuurreparatiebedrijf
285202|lasinrichting
24515|lederappretuurfabriek
1910|lederfabrieken
1910|lederindustrie
2462|lederlijmfabriek
191044|lederverlakfabriek
191044|lederververij
1920|lederwarenindustrie (excl. kleding en schoeisel)
295402|lederwarenmachinesfabriek
3617|ledikantenfabriek (metaal)
19104|leerbewerking en -afwerking
191043|leerglanzerij
19102|leerlooierij (na 1900, chroomzouten)
19101|leerlooierij (voor 1900, plantaardige looistoffen)
191041|leertouwerij
175205|leidselmakerij (textiel)
1810|lerenkledingfabriek
2412|lethoponefabriek
175206|letonmakerij
2222|letterdrukkerij
275408|lettergieterij
275408|lettergieterij (zetterij)
222402|letterzetterij
453101|lichtbakken verzorging
222274|lichtdrukkerij
4004|lichtgasfabriek
2722|lichtmastenfabriek (staal)
526335|lichtpetroleumdetailhandel
50513|lichtpetroleumpompinstallatie
315002|lichtreclamefabricage
315002|lichtreclamefabriek
292202|lierenfabriek
292201|liftenfabriek
2462|lijm- en plakmiddelenfabriek
2462|lijmfabriek
2462|lijmkokerij
2462|lijmziederij
175201|lijnbaan
175201|lijndraaierij
157103|lijnkoekenbrekerij en -malerij
154101|lijnoliefabriek
205101|lijstenmakerij
205101|lijstenmakerij en encadreerinrichting
24421|likdoornzalffabriek
1591|likeurdestilleerderij
1591|likeurstokerij
73110|limnologisch laboratorium
153201|limonadefabriek
22251|linieerbedrijf
17304|linnenblekerij
1714|linnenindustrie (grootschalig)
17301|linnenververij
1753|linoleum- en viltzeilindustrie
175305|linoleumfabriek
241310|lithiumfabriek
222277|lithografisch bedrijf
284009|loden pijpenfabriek
284009|loden pijpentrekkerij
515733|lompengroothandel
515733|lompenhandel
287701|lood- en zinkwerkerij
287705|loodasbranderij
287705|loodbranderij
27432|loodertsfabriek
275407|loodgieterij
45331|loodgieters-, fitters- en sanitairinstallatiebedrijf
45331|loodgietersbedrijf
284007|loodpletterij
241212|loodsuikermakerij (verfgrondstof)
287705|loodwerkerij
287705|loodwerkerij en -branderij
241211|loodwitfabriek
241211|loodwitfabriek/-molen
241211|loodwitmolen
241300|loogmakerij
191053|looi-extractfabriek
515511|looistoffengroothandel
014121|loonbedrijf t.b.v. land- en tuinbouw
17304|loonblekerij (textiel)
18|loonconfectiebedrijf
17302|loondrukkerij (textiel)
014122|loonsproeibedrijf
17301|loonververij (textiel)
2512|loopvlakvernieuwingsbedrijf
502055|lpg-tank installatiebedrijf
2513|luchtbeddenfabriek
2923|luchtbehandelingssapparatenfabriek
74811|luchtfotografiebedrijf
632301|luchthaven
752203|luchtmachtbasis
2923|luchttechnische apparatenfabriek
2923|luchttechnische, koel- en droogapparatenfabrieken en -installatiebedrijven
24662|luchtverversersmiddelenfabriek
24682|lucifers- en vuurmakersfabriek
24682|lucifersfabriek
231029|lysolfabriek (desinfeceterende zeep uit kalizeep en cresol)
231029|lysolfabriek (desinfecterende zeep uit kalizeep en cresol)
292406|maalinstallatie-onderhoudsbedrijf
293201|maalwerktuigenfabriek
2953|machine- en apparatenfabriek voor de voedings- en genotmiddelenindustrie
295604|machine- en apparatenfabriek voor specifieke doeleinden n.e.g.
29|machine- en apparatenindustrie
292406|machine- en apparatenreparatiebedrijf
29|machine-industrie
232023|machine-oliefabriek
292405|machine-onderdelenfabriek
285201|machinebankwerkerij
29|machinefabriek
295601|machinefabriek rubber- en kunsstofverwerkende industrie
295602|machinefabriek voor de aardolie-, chemische- en farmaceutische industrie
295202|machinefabriek voor de bouwnijverheid
295201|machinefabriek voor de delfstoffenwinning
2957|machinefabriek voor de hout- en meubelindustrie
2951|machinefabriek voor de ijzer- en staalindustrie
295402|machinefabriek voor de leer-, lederwaren- en schoeiselindustrie
2955|machinefabriek voor de papier-, karton-, papierwaren- en kartonwarenindustrie
295601|machinefabriek voor de rubber- en kunststofverwerkende fabriek
295401|machinefabriek voor de textiel- en kledingindustrie
295403|machinefabriek voor de wasserij en chemische reiniging
295203|machinefabriek voor de wegenbouw
2940|machinegereedschappenfabriek
516|machinegroothandel
291101|machinekamerinstallatiebedrijf
292406|machinereparatiebedrijf
71342|machineverhuurbedrijf
71342|machineverhuurbedrijf (algemeen)
311008|magneetfabriek
246212|magneetfolie- en bandfabriek
241451|magnesietmalerij
246502|magnetofoonbanden-fabriek
156201|mais-, tarwe-  en rijststijfselfabrieken
156201|maisstijfselfabriek
332005|manometerfabriek
154|margarine-, olie-, en vettenindustrie
1543|margarinefabriek
752202|marinebasis
174008|markiezenmakerij
191022|marokijnfabriek (korrelig leer)
17304|marseilleblekerij
287401|massadraaiwerkfabriek
27452|massiefgoudfabriek (tin en zwavel)
3517|mast- blok- en pompmakerij
3517|mast-, blok- en pompmakerij
24121|masticotfabriek (gele verfstof)
265117|mastiek cementfabriek
452201|mastiekwerkerij
287503|matomrandingen fabriek
361501|matrassenmakerij (geen spiraal)
2862|matrijzenfabriek
175101|mattenmakerij
014121|mechanisatiebedrijf t.b.v. landbouw
292406|mechanisch pneumatische apparatenreparatiebedrijf
3621|medaille- en sportprijzenfabriek
73108|medisch laboratorium
3310|medische apparaten en instrumenten en orthopedische en protese-artikelen industrie
295605|medische apparaten- en instrumentenfabriek (electronisch)
295605|medische apparatenfabriek (elektronisch)
331023|medische installatiesfabriek
3310|medische instrumenten-/orthopedische industrie
331023|medische instrumentenfabriek
331023|medische instrumentenreparatiebedrijf
331023|medische, chirurgische en tandheelkundige apparaten en instrumentenfabriek
156|meelindustrie
332002|meet- en regelapparatenfabriek
332|meet-, regel- en controleapparatuur industrie
332002|meetapparatenfabriek
241433|melangefabriek
15511|melkfabriek
15512|melkinrichting
15512|melkinrichting- en melkontvangststation
15512|melkontvangststation
15513|melkpoeder- en zuivelconservenfabriek
15513|melkpoederfabriek
15513|melksuikerfabriek
2871|melktransportkannenfabriek
241443|melkzuurfabriek
157101|mengvoederfabriek
24121|meniefabriek
2861|messenfabriek
2861|messenmakerij
014126|mestdrogerij (tanks)
2940|metaalbewerkingsgereedschappenfabriek
2940|metaalbewerkingsmachine-industrie
2811|metaalconstructiebedrijf
287401|metaaldraaierij
2871|metaalemballagefabriek
51521|metaalerstengroothandel
14503|metaalertsenwinningbedrijf
14503|metaalertsenwinningsbedrijf
2873|metaalgaasfabriek
275|metaalgieterij
285125|metaalharderij
284002|metaalklopperij
3617|metaalmeubelfabriek
3617|metaalmeubelindustrie
2851|metaaloppervlaktebehandelingsbedrijf
284009|metaalpijpenbewerkingsinrichting
284009|metaalpijpenfabriek
24515|metaalpoetscremefabriek
3710|metaalrecyclingsbedrijf
285203|metaalslijp-, -polijst-, -straal- en -graveerbedrijf
285203|metaalslijperij
275|metaalsmelterij
285121|metaalspuitinrichting (metalliseren)
285203|metaalstraalbedrijf
2851|metaalveredelingsinrichting
285131|metaalverlakkerij
287503|metaalwarenfabriek
28|metaalwarenindustrie
51522|metalen en metaalhalffabrikatengroothandel
51522|metalen- en metaalhalffabrikatengroothandel
515|metalen-, olieproducten, chemicaliën- en rubbergroothandel
51522|metalengroothandel
284009|metalenpijpenfabriek
241226|methaankleurstoffenindustrie
241319|methanolfabriek
2531|methylmetacrylaatverwerkend bedrijf
266401|metselspeciebereiderij
3616|meubelindustrie
2957|meubelindustriemachinesfabriek
201025|meubellogerij
202004|meubelplaatfabriek
361601|meubelspuiterij
361601|meubelverlakkerij (hout)
361601|meubelververij (hout)
361601|meubelververij en -spuiterij
24515|meubelwasfabriek
241316|mierenzuurfabriek
1450|mijnbouw
295201|mijnbouwgereedschapfabriek
295201|mijnbouwmachine-industrie
752205|militair oefenterrein
752204|militair schietterrein
7522|militaire basis
24121|mineraalgeelfabriek
1598|mineraalwaterfabriek
26667|minerale bouwplaten-fabriek
51513|minerale olieproductengroothandel (geen brandstoffen)
268203|minerale productenfabriek
287401|moerenfabriek (gedraaide)
287401|moerenfabriek (gestampte)
285111|moffelinrichting
4542|molenmakerij
453101|montagebedrijf
266402|mortelmolen
351802|mospapierfabriek
152007|mosselbewerkingsinrichting
1587|mosterdfabriek
3541|motor- en bromfietsenfabriek
92332|motorcrossterrein/skelterbaan
291101|motoren- en turbinefabriek
291102|motorenrevisiebedrijf
504021|motorfietsendetailhandel (geen reparatie)
504|motorfietsenhandel
504022|motorfietsenreparatiebedrijf
2940|motorkettingzagenfabriek
291102|motorproefstand
3541|motorrijwielfabriek
354402|motorrijwielonderdelenfabriek
712201|motorschipverhuurbedrijf
51571|motorsloperij
501044|motorvoertuigenherstelinrichting
24421|mousserende zoutenfabriek
1597|mouterij
26664|mozaiktegelfabriek
295604|muizevallenfabriek
63151|munitiedepot
296002|munitiefabriek (lichte munitie)
3621|munten- en medaillefabriek
3630|muziekinstrumentenfabriek (exc. electronische)
3630|muziekinstrumentenindustrie
363005|muziekinstrumentenreparatiebedrijf
1716|naai- en breigarensfabricage
1716|naaigarenfabriek
285203|naamplatenmakerij
241223|natriumsulfietfabricage
241223|natriumsulfietfabriek
241301|natrosolfabriek
315006|neonbuizenfabriek
012503|nerts- en pelsdierenfokkerij
012503|nerts- en pelsdierfokkerij
175203|nettenboeterij
1752|nettenfabriek
351101|nieuwbouw- en reparatiewerven van woonboten en casco's
285123|nikkelanodenfabriek
241229|nitro- en nitrosokleurstoffenindustrie
274|non-ferrometaalertsvoorbewerkingsinrichting
274|non-ferrometaalextrusiebedrijf
275402|non-ferrometaalgieterij
274|non-ferrometaalindustrie
275402|non-ferrometaalsmelterij
274|non-ferrometaaltrekkerij
274|non-ferrometaalwalserij
51523|non-ferrometalengroothandel
151103|noodslachting
241463|noritfabriek
272201|norton-puttenonderdelenfabriek
154106|notenverwerkende fabriek
2330|nucleaire raffinaderij
4000|nutsbedrijf
2529|nylonproductenfabriek
2529|nylonspuitgietbedrijf
2529|nylonspuitgietbedrijf en -productenfabriek
222273|offsetdrukkerij
2863|ogenmakerij
232022|olie- en vetten recyclingsfabriek
295602|oliebranderfabriek
40046|oliegasfabriek
232025|oliehardingsfabriek
182221|oliekledingfabriek
154104|oliekokerij
232024|oliemengerij (met plantaardige vetten)
154103|oliemolen
157102|olieslagerij
631115|olieterminal
603001|olietransportleiding
154201|oliezuiveringsfabriek
51514|oliën en vettengroothandel (minerale)
252204|omhulselelementen fabriek
631266|ommuurde benzinetank
631260|ommuurde brandstoftank
631261|ommuurde dieseltank
631262|ommuurde hbo-tank
631264|ommuurde petroleumtank
631268|ommuurde smeerolietank
631265|ommuurde stookolietank
631269|ommuurde vluchtige productentank
999999|onbekend
631246|ondergrondse benzinetank
631298|ondergrondse bestrijdingsmiddelentank
631240|ondergrondse brandstoftank
631241|ondergrondse dieseltank
631242|ondergrondse hbo-tank
631244|ondergrondse kerosinetank
631244|ondergrondse lichtpetroleumtank
631240|ondergrondse olietank
631244|ondergrondse petroleum-derivatentank
631244|ondergrondse petroleumtank
631245|ondergrondse stookolietank
631247|ondergrondse tank voor afgewerkte olie
631249|ondergrondse terpentijnolietank
631243|ondergrondse white-spirittank
747021|ongediertebestrijdingsbedrijf
631234|onoverdekte kolenbewaarplaats
900033|ontgronding
315007|ontladingsbuizenfabriek
747021|ontsmettings- en ongediertebestrijdingsbedrijf
747021|ontsmettingsbedrijf
242002|ontsmettingsmiddelenfabriek
274313|onttinningsfabriek
24664|ontvettingsmiddelenfabriek
000000|onverdachte activiteit
631122|op- en overslagbedrijf (goederen)
452315|openbare werken (gemeente)
900070|ophooglaag (niet gespecificeerd)
900075|ophooglaag met baggerspecie
900079|ophooglaag met grond
900074|ophooglaag met houtafval
900072|ophooglaag met huishoudelijk afval
900078|ophooglaag met industrieel- en bedrijfsafval
900073|ophooglaag met kolengruis en/of sintels
900077|ophooglaag met puin en/of bouw- en sloopafval
900071|ophooglaag met slakken
34202|opleggersfabriek
712103|opleggerverhuurbedrijf
372001|oplosmiddelenterugwininstallatie
24121|oprimetfabriek (gele verfstof)
233001|opslag radioactief materiaal
631202|opslag van alcoholen
631203|opslag van aldehyden, ethers, esters of ketonen
631205|opslag van alifatische koolwaterstoffen
631206|opslag van aromatische koolwaterstoffen
631210|opslag van gassen
631207|opslag van gehalogeneerde koolwaterstoffen
631209|opslag van metallische (zout)oplossingen
631208|opslag van verf of drukinkt
631204|opslag van vetzuren of zepen
631201|opslag van zuren of basen
900092|opslag verontreinigde grond
334002|opticiënswerkplaats
334001|optische artikelenfabriek
334001|optische en fototechnische artikelen industrie
334001|optische en fototechnische industrie
24142|organische chemische grondstoffen-fabriek
241421|organische oplosmiddelenfabriek
24154|organische peroxidenfabricage
24154|organische peroxidenfabriek
363001|orgelmakerij
331022|orthopedische artikelenfabriek
331022|orthopedische artikelenreparatiebedrijf
331022|orthopedische en prothese-artikelenfabriek
51572|oude metalengroothandel (schroot)
515732|oudpapiergroothandel
2112|oudpapierverwerkingsbedrijf
452541|ovenbouwbedrijf (steen)
297201|ovenbouwfabriek
502054|overige auto-onderhoudsbedrijven
366325|overige be- en verwerkende industrie
453403|overige bouwinstallatiebedrijven
241|overige chemische grondstoffenindustrie
2466|overige chemische productenindustrie
2466|overige chemische productenindustrie n.e.g.
2811|overige constructiewerkplaatsen
1450|overige delfstoffenwinning
3210|overige elektrotechnische industrie
4545|overige gebouwenafwerkingsbedrijven
2524|overige kunststofproductenindustrie
29|overige machine- en apparatenindustrie
2924|overige machine-industrie
268203|overige minerale producten-industrie
232022|overige olieproductenfabriek
527402|overige reparatiebedrijven tbv particulieren
1750|overige textielindustrie
3550|overige transportmiddelenindustrie
158|overige voedingsmiddelenindustrie
191027|overleerlooierij
011212|paddestoelenkwekerij
152003|palingrokerij (groot)
714052|pallets- en kistenverhuurbedrijf
204003|palletsfabriek
011215|palmboomkwekerij
264002|pannenbakkerij
2112|papier- en kartonfabriek
211|papier- en kartonindustrie
21211|papier- en kartonverpakkingsmiddelenfabriek
212|papier- en kartonwarenfabriek
21|papier- en papierwarenindustrie
211|papier- pulp- en kartonindustrie
2123|papierbenodigdhedenfabricage voor kantoor en school
212202|papierbordfabriek
2112|papierfabriek
2955|papiermachinesfabriek
212502|papierverwerkingsbedrijf
212|papierwarenfabriek
212502|papierwarenfabriek n.e.g.
21213|papierwolfabriek
232012|paraffinefabriek
174005|paraplufabriek
2452|parfum- en cosmetica-industrie
2451|parfumerie- en cosmetica-industrie
2452|parfumeriefabriek
632101|parkeergarage
203021|parket- en hardhoutenvloerenfabriek
203021|parketvloerenfabriek
632205|parlevinker
175401|passementfabriek
24121|pastelfabriek (droge kleurstof)
154102|patent-oliefabriek
231021|pekfabriek
183001|pelsbereiderij
183|pelsbereiderijen, bontfabrieken en bontbewerkerijen
191026|perkamentmakerij
284002|persbedrijf
6023|personenvervoerbedrijf
241607|perspexfabriek
24141|petrochemischeproductenfabriek
631304|petroleum- of kerosinetank (bovengronds)
631254|petroleum- of kerosinetank (ingemetseld)
631264|petroleum- of kerosinetank (ommuurd)
631244|petroleum- of kerosinetank (ondergronds)
526335|petroleumdetailhandel
232011|petroleumfabriek
40045|petroleumgasfabriek
631264|petroleumtank (ommuurd)
241602|phenolharsfabriek
363002|pianofabriek
363003|pianoreparatiebedrijf
262101|pijpenbakkerij
284009|pijpentrekkerij
286302|pijphangersfabriek
2722|pijpleidingenbouwbedrijf
231031|pikstokerij
2811|plaat- en buisconstructiebedrijf
222291|plaatdrukkerij
287708|plaatijzerbewerkingsbedrijf
287501|plaatstalenschakelkastenfabriek
246211|plakbandfabriek
243053|plamuurfabriek
154101|plantaardige olie- en vettenfabriek
154101|plantaardige oliën- en vettenfabriek
011215|plantenkwekerij
01411|plantsoendienst
01411|plantsoendienst/hoveniersbedrijf
2525|plastic artikelenfabriek
252202|plastic containerfabriek
222284|plastic drukkerij
252201|plastic emballagefabriek
2523|plastic kozijnenfabriek
2525|plastic productenfabriek
2525|plastic spuitgietbedrijf
2525|plastic spuitgietbedrijf en -productenfabriek
222284|plasticbedrukkerij
262101|plateelbakkerij
2630|plavuizen- en estrikkenfabriek
285109|pleetmakerij (koper/ijzer met goud/zilver/platina laag)
24424|pleisterfabriek
182403|plisseerbedrijf
151321|pluimveeconservenfabriek
1512|pluimveeslachterij
157101|pluimveevoederfabriek
295204|pneumatische installaties-fabriek
1586|poederkoffiefabriek
24515|poets- en onderhoudsmiddelenfabriek
930121|poetsdoekenfabriek (chem. reinig.)
24515|poetsmiddelenfabriek
51443|poetsmiddelengroothandel
285203|polijstinrichting
243051|politoerfabriek
201027|politoerinrichting (houtverfraaiing)
241621|polyamidefabriek (pa)
4545|polyamische wanddecor en constructiebedrijf
241622|polycarbonaatfabriek (pc)
285103|polychromeerbedrijf
2526|polyester silofabriek
2526|polyester spuitgietbedrijf en -productenfabriek
2526|polyester zeilbotenfabriek
241623|polyesterfabriek
241605|polyesterharsfabriek
2526|polyesterverwerkend bedrijf
241624|polyethyleenfabriek (pe)
252205|polyethyleenzakkenfabriek
241625|polymethylacrylaatfabriek (pmma)
2531|polymethylmetacrylaatverwerken
241626|polypropyleenfabriek (pp)
241627|polystyreenfabriek (ps)
2527|polystyreenproductenfabriek
2527|polystyreenverwerking
241631|polytetrafluoretheenfabriek
241628|polyurethaanfabriek (pur)
2528|polyurethaanproductenfabriek
241628|polyurethaanschuimfabriek
2528|polyurethaanverwerking
241629|polyvinylchloridefabriek (pvc)
291201|pompen- en compressorenfabriek
291202|pompen- en compressorenreparatiebedrijf
291201|pompenfabriek
291202|pompenreparatiebedrijf
2811|pontonmakerij
262101|porseleinfabriek
2628|porseleinschilderwerkplaats
265116|portlandcementfabriek
3001|postbehandelingsmachinefabriek
241308|potasbranderij
241308|potasbranderij annex -wasserij (kaliumcarbonaat)
241309|potasfabriek
241308|potaswasserij
205103|potloodfabriek
205103|potloodmolen
011215|potplantenkwekerij
262102|pottenbakkerij
274|primaire non-ferrometaalfabrieken
73105|proefstation
331022|prothese-artikelenfabriek
452315|provinciale werkplaats
451111|puinbreekinstallatie (niet mobiel)
211|pulp- en kartonindustrie
26611|pulspalenfabriek (beton)
2528|purschuimfabriek
241306|pyriet-ontkopering
332006|pyrometerfabriek
24612|pyrotechnische artikelenfabriek
50201|quick-service-station
3430|radiateurenfabriek (auto's)
502032|radiateurenreparatiebedrijf
2822|radiatorenfabriek
2822|radiatorenreparatiebedrijf
32201|radio-ontvangstapparatenfabriek
315003|radiolampenfabriek
2812|ramen-, deuren- en kozijnenfabriek (metaal)
2812|ramenfabriek (stalen en non-ferro)
174002|ravesmakerij (licht zeildoek)
24702|rayonfabriek (caprolactam)
24701|rayonfabriek (viscose)
2470|rayonindustrie (grootschalig)
222287|reclamedrukkerij
454401|reclameschildersbedrijf
332002|regelapparatenfabriek
182221|regen- en oliekledingfabriek
2524|regeninstallatiesfabriek
182221|regenkledingfabriek
174005|regenschermmakerij
747021|reinigings- en ontsmettingsbedrijven, polderbemalingsinrichtingen
292406|reinigingsapparatuurreparatiebedrijf
24514|reinigingsmiddelenfabriek
51443|reinigingsmiddelengroothandel
222286|reliëfdrukkerij
527402|reparatiebedrijf gebruiksgoederen
222276|reprografisch bedrijf
731|research- en wetenschappelijke instellingen
731|researchinstelling
2821|reservoirbouwbedrijf
24143|reukstoffenfabriek (synthetisch)
2452|reukwerkfabriek
205202|riet-, rotan- en vlechtwarenindustrie
205202|rietmeubelenfabriek
205202|rietsplijterij
156201|rijststijfselfabriek
156201|rijstzetmeelfabriek
34205|rijtuigenfabriek
454401|rijtuigschildersbedrijf
354|rijwiel- en motorrijwielindustrie
3544|rijwiel- en motorrijwielonderdelenfabriek
51486|rijwielengroothandel
354401|rijwielonderdelenfabriek
527401|rijwielreparatiebedrijf
285133|rijwielverlakkerij
272201|rioleringsbuizen- en puttenfabriek (ijzer)
272201|rioleringsstelselonderdelenfabriek
264004|rioolbuizenfabriek (bakkerij)
900012|rioolslibdepot
900011|rioolwaterzuiveringsinrichting (rwzi)
2823|roestvrijstaal apparatenfabriek
2823|roestvrijstaalbewerkingsbedrijf
3617|roestvrijstalen aanrechtenfabriek
2823|roestvrijstalenapparatenfabriek
151102|roetbereiderij (dierlijk vet)
2812|rolluikenfabriek
174002|rolrederij (zeildoek)
3543|rolstoelreparatiebedrijf
205202|rotanmeubelenfabriek
222294|rotatie-diepdrukkerij
222293|rotogravure-inrichting
011117|rozenkwekerij
25|rubber- en kunststofverwerkende industrie
2513|rubberartikelenfabriek
2511|rubberbandenfabriek
2417|rubberfabriek
2511|rubberfietsbandenfabriek
2513|rubberproductenindustrie
2513|rubberverwerkende fabriek
191051|runmolen
191052|runsmelterij
2710|ruwijzer- en staalindustrie
27101|ruwijzerfabriek
231027|sacharinefabriek
171202|sajetfabriek
17301|sajetververij
241424|salpeterraffinaderij
241424|salpeterraffinaderij en -stokerij
241424|salpeterstokerij
1930|sandalenfabriek
203024|sandwichpanelenfabriek
2622|sanitair aardewerkfabriek
45331|sanitair installatiebedrijf
2122|sanitaire en huishoudelijke papierwarenfabriek
2122|sanitaire papierwarenfabriek
152002|sardijnfabriek (sardines)
287503|schaatsenfabriek
205106|schaatshoutenmakerij
192004|schachtenmakerij (leer)
3120|schakel- en verdeelinrichtingenfabriek
3120|schakelkastenfabriek
3120|schakelmateriaalfabriek
2861|scharen-, messen- en bestekfabrieken
2861|scharenfabriek
2862|schavenmakerij
284001|scheepsankerfabriek
291402|scheepsassen- en -schroevenfabriek
291402|scheepsassenfabriek
351|scheepsbouw- en scheepsreparatiebedrijf
284001|scheepskettingenfabriek
332004|scheepskompasfabriek
291101|scheepsmotorenfabriek
351101|scheepsreparatiebedrijf
351102|scheepsschilderbedrijf
351102|scheepsschilderbedrijf en -spuiterij
351102|scheepsschoonmaakbedrijven e.d.
291402|scheepsschroevenfabriek
351103|scheepssloperij
284001|scheepssmederij
351102|scheepsspuiterij
3513|scheepstimmerwerf (hout voor 1890)
351101|scheepswerf, nieuwbouw en reparatie (metaal na 1890)
61101|scheepvaartbedrijf
61101|scheepvaartbedrijf (zee)
2971|scheerapparatenfabriek
24511|scheerzeepfabriek
203024|scheidingswandenfabriek
265202|schelpkalkbranderij
315008|schemerlampenfabriek
287504|scherpsmederij
926238|schietbaan
926238|schietbaan (particuliere vereniging)
752401|schietbaan (politie)
24121|schijtgeelfabriek
454401|schildersbedrijf
517142|schildersbenodigdhedengroothandel
454401|schilderswerkplaats
1930|schoenenfabriek
1930|schoenfabriek
295402|schoenmakersmachinefabriek
1930|schoenonderdelenfabriek
24515|schoensmeerfabriek
291101|schoepen/turbinefabriek
34301|schokdempersfabriek
2123|schoolbenodigdhedenfabriek (papier)
747012|schoonmaakbedrijf
452541|schoorsteen- en ovenbouwbedrijf
452541|schoorsteenbouwbedrijf
285121|schopeer-, metalliseerbedrijf
285121|schopeerbedrijf (gesmolten metaal spuiterij)
2862|schoppenmakerij
243041|schrijfinktfabriek
246601|schrijfmachinelintenfabriek
2874|schroeven-, massadraaiwerk-, verenindustrie
287401|schroevenfabriek
24176|schuimrubberfabriek
212504|schuurpapierfabriek
3541|scooterfabriek
7124|scooterverhuurbedrijf
191030|segrinmakerij (gekorreld leer)
212201|servettenfabriek
262101|serviesfabriek
2628|serviesschilderwerkplaats
3622|sieradenmakerij
266302|sierbetonfabriek
011215|sierplanten- en sierstruikenkwekerij
3622|sierradenmakerij
160001|sigarendrogerij
160001|sigarenfabriek
160002|sigarettenfabriek
32201|signaalapparatenfabriek
24174|siliconenrubberfabriek
153203|siroopkokerij
175101|sisalmattenfabriek
2222|sitspapierdrukkerij (papier voor boekbinderij en apotheek)
631235|slachtafvalopslagplaats
151|slachterij en vleeswarenindustrie
151110|slachthuis
515731|slachtproductengroothandel
502052|sleep- en bergingsbedrijf (voertuigen)
61203|sleepboot- en duwvaartbedrijf
61203|sleepbootbedrijf
351105|sleephelling (schepen)
2681|slijp- en polijstmiddelenfabriek
900066|slootdemping met agrarisch afval en/of takkenbossen
900063|slootdemping met baggerspecie
900069|slootdemping met grond
900064|slootdemping met houtafval
900062|slootdemping met huishoudelijk afval
900068|slootdemping met industrieel- en bedrijfsafval
900065|slootdemping met lompen
900067|slootdemping met puin en/of bouw- en sloopafval
45111|sloperij van bouwwerken
2863|slotenmakerij
24143|smaak- en geurstoffenindustrie (synthetisch)
24143|smaakstoffenfabriek (synthetisch)
287504|smederij
246811|smeerkaarsenfabriek
232023|smeermiddelenfabriek (technische)
631308|smeerolietank (bovengronds)
631258|smeerolietank (ingemetseld)
631268|smeerolietank (ommuurd)
631248|smeerolietank (ondergronds)
51514|smeeroliën en -vettenhandel (minerale)
232023|smeeroliën- en smeervettenfabriek
51514|smeeroliën- en vettengroothandel
232023|smeeroliënfabriek
232023|smeervettenfabriek
15131|snacks- en kant-en- klaar-maaltijdenfabrieken
011214|snijbloemenkwekerij
158422|snoepfabriek
36631|sociale werkplaats
241423|sodafabriek
15893|soep- en soeparomafabriek
27454|soldeerfabriek
27454|soldeermaterialenfabriek
251301|solutiefabriek
251301|solutiefabriek (rubber opgelost in benzeen)
202003|spaanderplaatfabriek
24121|spaansgroenfabriek
1587|specerijenfabriek
3640|speelgoed- en sportartikelenindustrie
3650|speelgoedartikelenfabriek
2222|speelkaartenfabriek
287301|speldenmakerij (metaal)
261204|spiegelfabriek
287302|spijker-, draadnagelfabriek
287302|spijkermakerij
212505|spinhulzenfabriek
295401|spinpotcentrifugefabriek
3520|spoor- en tramwegmaterieelindustrie en -reparatie
601010|spoorrails/smalspoor
60101|spoorwegemplacement
352011|spoorwegwerkplaats
3640|sportartikelenfabriek
192005|sportballenfabriek (leder)
174001|spreienfabriek
24611|springstoffenfabriek
63152|springstoffenopslag
63152|springstoffenopslagplaats
287402|springverenfabriek
287402|springverenmakerij
242001|sproeipoederfabriek
24662|spuitbussenvulbedrijf
2811|staalbewerkingswerkplaats
2722|staalbuisproductenfabriek
2722|staalbuizenfabriek
2811|staalconstructiebedrijf
2734|staaldraadkabelfabriek
361701|staaldraadmatrassenfabriek
27102|staalfabriek
2752|staalgieterij
51522|staalgroothandel
285125|staalharderij
3617|staalkantoormeubelenfabriek
2752|staalsmelterij
285203|staalstraalbedrijf
51522|staalwol/staalkrullen handel
2731|stafstaaltrekkerij
2722|stalen buizenfabriek
2811|stalen trappenfabriek
2811|stalinrichtingfabriek
284002|stamp-, pers-, dieptrek- en forceerbedrijf
284002|stampbedrijf
284002|stangenmakerij
274311|stanniolfabriek (bladmetaal)
2681|steen-, grit- en krijtmalerijen
222272|steendrukkerij
264001|steenfabriek
287305|steengaasfabriek
515111|steenkolenbrekerij
40041|steenkolengasfabriek
631233|steenkolenoverslag
231|steenkolenproducten industrie (carbochemie)
231|steenkolenproductenfabriek
14501|steenkoolwinningsbedrijf
45233|steenzetters- en rijswerkersbedrijf
71321|steigerverhuurbedrijf
34204|stelmakerij
295101|stempelfabriek (metaal voor stansen e.d.)
212503|stencilfabriek
243042|stencilinktfabriek
17306|sterkerij (en ontsterkerij)
241317|sterkwaterfabriek (formaldehyde)
212501|stickerfabriek
156201|stijfselfabriek
24155|stikstoffabriek
205202|stoelmatterswerkplaats
17302|stoffendrukkerij
17301|stoffenververij
2971|stofzuigerfabriek
930120|stomerij
28301|stookinrichtingenfabriek
631305|stookolietank (bovengronds)
631255|stookolietank (ingemetseld)
631265|stookolietank (ommuurd)
631245|stookolietank (ondergronds)
61101|stoombootrederij
28301|stoomketel- en krachtwerktuigenindustrie
28301|stoomketelfabriek
28302|stoomketelreparatiebedrijf (ketelboeterij)
287503|stoomschaatssmederij
28301|stoomwerktuigenfabriek
243052|stopverffabriek
900030|stortplaats (niet gespecificeerd)
900050|stortplaats (zelling) in water buitendijks (niet gespec)
900050|stortplaats (zelling) in water buitendijks (niet gespecificeerd)
900046|stortplaats agrarisch afval en/of takkenbossen in water
900036|stortplaats agrarisch afval en/of takkenbossen op land
900043|stortplaats baggerspecie in water
900015|stortplaats baggerspecie op land
900035|stortplaats faecalien op land
900049|stortplaats grond in water
900039|stortplaats grond op land
900044|stortplaats houtafval in water
900042|stortplaats huishoudelijk afval in water
900032|stortplaats huishoudelijk afval op land
900040|stortplaats in water (niet gespecificeerd)
900040|stortplaats in water binnendijks (niet gepecificeerd)
900041|stortplaats industrieel- en bedrijfsafval in water
900031|stortplaats industrieel- en bedrijfsafval op land
900045|stortplaats lompen in water
900030|stortplaats op land (niet gespecificeerd)
900047|stortplaats puin en/of bouw- en sloopafval in water
900037|stortplaats puin en/of bouw- en sloopafval op land
900013|stortplaats rioolslib op land
900025|stortplaats veegvuil op land
900034|stortplaats zinkassen op land
900024|straat- en puttenreinigingsbedrijf
45232|stratenmakersbedrijf
246222|stremselfabriek/lebbendrogerij
2971|strijkijzerfabriek (elektrisch)
287502|strijkijzermakerij (niet-electrisch)
211221|strobordpapierfabriek
211221|strokartonfabriek
211221|stropapierfabriek
631114|stukgoedoverslagbedrijf
631116|stuwadoorsbedrijf
1583|suikerfabriek
1583|suikerindustrie
262101|suikervormfabriek
158422|suikerwerkenfabriek
24152|superfosfaatfabriek
241318|synthetische carbonzuurfabriek
2470|synthetische garenfabriek
2470|synthetische vezelfabriek
454304|systeemvloerenconstructiebedrijf
175204|taanderij (netten touwen zeilen)
175204|taankokerij
1600|tabakverwerkende fabriek
8513|tandartsenpraktijk
331023|tandheelkundige instrumentenfabriek
24512|tandpastafabriek
33101|tandtechnisch laboratorium
33101|tandtechnische werkplaats
2914|tandwielen-, lagers e.a. drijfwerkelementenfabrieken
291401|tandwielenfabriek
2821|tank- en reservoirfabriek
282|tank-, reservoir- en pijpleidingenfabriek
282|tank-, reservoir- en pijpleidingeníndustrie
747026|tankautocleaningbedrijf
2821|tankbouwbedrijf
747022|tankercleaningbedrijf
909002|tankgracht (gedempt)
175102|tapijt- en vloerkledenfabriek
175102|tapijtfabriek
1716|tapijtgarenspinnerij
156201|tarwestijfselfabriek
192006|tassenmakerij (leer)
6022|taxi- en toerwagenbedrijven
6022|taxibedrijf
453101|technisch installatiebedrijf
24|technisch-chemische fabriek
2416|technische kunststoffenfabriek
51514|technische oliehandel (minerale)
80222|technische school
287402|technische veren-fabriek
502051|tectyleerinrichting
23102|teerdestilleerderij
174002|teerdoekfabriek
231031|teerkokerij
231021|teerproduktenfabriek
51515|teerproduktenhandel
241631|teflonfabriek
241631|teflonfabriek (polytetrafluoretheen)
2630|tegelbakkerij
2630|tegelfabriek
2462|tegellijmfabriek
2630|tegelperserij
32202|telecommunicatie-apparatenfabriek
32202|telefonie-apparatuurfabriek
3230|televisie-ontvangstapparatenfabriek
205202|tenenmeubelenfabriek
174002|tentenfabriek
714053|tentoonstellingsmaterialenverhuurbedrijf
631309|terpentijn(olie)-tank (bovengronds)
631259|terpentijn(olie)tank (ingemetseld)
631269|terpentijn(olie)tank (ommuurd)
631249|terpentijn(olie)tank (ondergronds)
243015|terpentijnstokerij
50516|terpentine-installatie
50516|terpentinepompinstallatie
9301|textiel- en kledingreinigingsbedrijf
17304|textielblekerij
1730|textielblekerijen, -ververijen, -drukkerijen
17302|textieldrukkerij
17|textielfabriek
17|textielindustrie
295401|textielmachinesfabriek
9301|textielreiniging
17306|textielsterkerij en -ontsterkerij
1730|textielveredeling
17301|textielververij
1740|textielwarenfabriek
1740|textielwarenindustrie
246220|thermochemische fabriek
243016|thinnerfabricage
243016|thinnerfabriek
22222|tijdschriftendrukkerij
2030|timmer- en parketvloerindustrie
20301|timmerfabriek
2030|timmerwerkindustie
4542|timmerwerkplaats
274311|tinfabriek
275409|tingieterij
284008|tinpletterij
275409|tinsmelterij
241214|tinwitfabriek
241214|tinwitfabriek/-molen
241214|tinwitmolen
2122|tissuefabriek
6023|toerwagenbedrijf
24662|toiletverfrissersmiddelenfabriek
24682|tondeldozenfabriek
6023|touringcarbedrijf
1752|touw-, bindgaren- en nettenfabriek
1752|touwfabriek
175202|touwslagerij
154105|traankokerij
154202|traanzuiveringsfabriek
2931|tractorenfabriek
293202|tractorenreparatiebedrijf
50514|tractorpetroleumpompinstallatie
50514|tractorpetroleumpompinstallatie (carburine)
602|tram- en autobuslijndiensten, groepsvervoer
60102|tramemplacement en -remises
60102|tramlijndienst
352012|tramwegwerkplaats
222282|transferdrukkerij
311004|transformatorenfabriek
311007|transformatorenreparatiebedrijf
292203|transportbandenfabriek
6024|transportbedrijf
2871|transportkannenfabriek (metalen)
3550|transportmiddelenfabriek
3550|transportmiddelenfabriek n.e.g.
35|transportmiddelenindustrie
2922|transportwerktuigenfabriek
265111|trasfabriek
265113|trasmolen
265112|trasstamperij
601011|treinwasserij
241632|triacelfabriek (transparant folie)
1760|tricotstukgoederenfabriek
2020|triplex-, fineer- en meubelplaatfabrieken
2020|triplex-, fineer-, vezel-, board-, spaanderplaatindustrie
2020|triplex-, fineer-, vezel-, spaanderindustrie
202001|triplexfabriek
25122|truckbandencoveringsbedrijf
191025|tuigleerlooierij
01411|tuinbedrijf
011211|tuinbouwbedrijf
011215|tuinplantenkwekerij
011216|tuinzaadkwekerij
231041|turffabriek (gecarboniseerde)
24121|turksroodfabriek
222251|typografisch bedrijf
151401|uitbeenbedrijf
241603|ureumharsfabriek
3350|uurwerken- en klokkenindustrie
232026|vaselinefabriek
631234|vaste brandstoffenbewaarplaats
2871|vaten-, fusten- en transportkannenfabrieken (metalen)
2871|vatenfabriek (metalen)
747025|vatenreconditioneringsbedrijf
747025|vatenreconditioneringsbedrijf en vatenwasserij
747025|vatenspoelbedrijf
747025|vatenwasserij
157101|vee- en mengvoederfabriek
331024|veeartsenijkundige instrumentenfabriek
6312|veem- en pakhuisbedrijven
512172|veevoeder- en meststoffengroothandel
157101|veevoederfabriek
512411|vellenbloterij
24424|verbandmiddelenfabriek
291101|verbrandingsmotorenfabriek
285103|verchroominrichting
52462|verf- en verfwarendetailhandel
2430|verf-, lak-, vernis-, drukinkt- en mastiekindustrie
372002|verfbussenreinigingsbedrijf
24301|verffabriek
515321|verfgroothandel
243011|verfmolen
201024|verfspuitinrichting (hout)
285132|verfspuitinrichting (metaal)
2412|verfstoffenfabriek
515322|verfwarengroothandel
51551|vergiften/bijtende middelenhandel
275410|verguldbronsfabriek
285106|vergulderij
287503|verkeersbordenfabriek
292403|verkoopautomatenfabriek
315005|verlichtingsarmaturenfabriek
315005|verlichtingsornamenten en -armaturenfabriek
315005|verlichtingsornamentenfabriek
24121|vermillioenfabriek
285101|vernikkelarij
24303|vernisfabriek
285134|vernisinrichting (metaal)
243031|vernisstokerij
292401|verpakkingsmachinefabriek
285102|vertinnerij
2923|verwarmingsapparatenfabriek
285107|verzilverinrichting
285104|verzinkerij
40043|vetgasfabriek (uit olie en steenkool)
246811|vetkaarsenfabriek
151102|vetsmelterij
2020|vezel- en spaanderplaatfabrieken
1753|vezel- en viltzeilindustrie
21214|vezelvliesfabriek
2862|vijlenkapperij
182405|viltenhoedenfabriek
175301|viltfabriek
175303|viltvliesfabriek
175302|viltzeilfabriek
2862|vingerhoedmakerij
152002|visconserven- en sardinefabriek
152002|visconservenfabriek
24701|viscosefabriek
24701|viscosefabriek (kunstzijde/rayon)
152006|visfileerbedrijf
2861|vishoekmakerij
2462|vislijmfabriek
2462|vislijmziederij
152008|vismeelfabricage
152008|vismeelfabriek
152003|visrokerij
731013|visserij researchinstelling
175207|vistuigmakerij
152|visverwerkend bedrijf
152004|viszouterij
241304|vitrioolstokerij
174004|vlaggenfabriek
222271|vlakdrukkerij
1714|vlasbewerking en -spinnerij (linnen)
171401|vlasbewerkingsinrichting (chemisch)
171401|vlasroterij (chemisch)
175401|vlechtwerkfabriek
1514|vleesafvalverwerkend bedrijf
151321|vleesconservenfabricage
151321|vleesconservenfabriek
15134|vleesdrogerij en -zouterij
2953|vleesmachinesfabriek
246224|vleesmeelfabriek
15133|vleesrokerij
1513|vleesverwerkend bedrijf
15132|vleeswarenfabricage
15132|vleeswarenfabriek
3530|vliegtuigbouw- en vliegtuigreparatiebedrijf
3530|vliegtuigbouwfabriek
3530|vliegtuigreparatiebedrijf
900016|vloeiveld
454304|vloerenleggersbedrijf
1751|vloerkleden- en tapijtindustrie
175102|vloerkledenfabriek
175101|vloermattenfabriek
24515|vloerwasfabriek
175304|vloerzeilfabriek
631259|vluchtige productenopslagtank (ingemetseld)
631269|vluchtige productenopslagtank (ommuurd)
15|voedings- en genotmiddelenindustrie
2953|voedings- en genotmiddelenmachinefabriek
15892|voedingsmiddelenfabriek
15892|voedingsmiddelenfabriek n.e.g.
157201|vogelvoederfabriek
0112|volkstuinen
2222|voorwerpenbedrukkerij
501032|vrachtwagenreparatiebedrijf
631222|vriesinstallatie
1533|vruchtenconfijterij
1533|vruchtenconservenfabriek
241432|vruchtenessencefabriek
1532|vruchtensappenfabriek
153203|vruchtensiroopfabriek
1533|vruchtenverduurzamingsfabriek
1594|vruchtenwijnfabriek
900222|vuilnisstortplaats
900096|vuilverbrandingsslakkenopslagplaats
24179|vulcaniseerinrichting
24682|vuurmakersfabriek
26301|vuurvastestenenfabriek
26301|vuurvastestenenfabriek (charmotte)
24612|vuurwerkfabriek
24612|vuurwerkfabriek (pyrotechniek)
24612|vuurwerkwerkplaats
34204|wagenmakerij
232023|wagensmeerfabriek
3520|wagonbouw en spoorwegwerkplaatsen
352001|wagonbouwbedrijf
296001|wapenfabriek (lichte wapens)
2923|warmtetechnisch apparatuurfabriek
410010|warmtevoorzieningsbedrijven
930111|was- en strijkinrichting
51443|was-, poets- en reinigingsmiddelengroothandel
50515|wasbenzinepompinstallatie
246813|wasbleekerij (bijenwas e.d.)
930125|wasblekerij (kleding)
174002|wasdoekfabriek
246813|waskaarsenmakerij
295403|wasmachine-assemblagebedrijf
24513|wasmiddelenfabriek
51443|wasmiddelengroothandel
930110|wasserij (natwasserij)
295403|wasserijmachinefabriek
151403|wassmelterij
24515|waterafstotende middelenfabriek
264004|waterbuizenbakkerij
174006|waterdichtegoederenfabriek
24515|waterdichtemiddelenfabriek
410010|waterdistributiebedrijf
40042|watergasfabriek
45331|waterleiding installatiebedrijf
410010|waterleidingbedrijf
332002|watermeterreparatiebedrijf
410010|waterpompstation
526336|waterstokerij
243014|waterverffabriek
452312|waterwerken bedrijf
410010|waterwinnings- en -distributiebedrijf
410010|waterwinningsbedrijf
900011|waterzuiveringsinrichting
73107|waterzuiveringsproefstation
24424|wattenfabriek
246812|waxinefabriek
2122|wc-papierfabriek
295401|weefgetouwenfabriek
295401|weefgetouwmakerij
292402|weegwerktuigen- en winkelmachinesfabriek
292402|weegwerktuigenfabriek
292406|weegwerktuigenreparatiebedrijf
332003|weerglasmakerij
45231|weg- en waterbouwbedrijf
45231|weg- en waterbouwopleidingsbedrijf
452311|wegenbouwbedrijf
295203|wegenbouwmachinesfabriek
452316|wegensteunpunt/zoutopslag
901001|wegfundering/wegverharding met asbest
901002|wegfundering/wegverharding met puin
901003|wegfundering/wegverharding met zinkassen
602|wegvervoer
351101|werf van vissersboten en zeeslepers
1821|werk- en bedrijfskledingfabriek
1821|werkkledingfabriek
631303|white spirit-/terpentinatank (bovengronds)
631253|white spirit-/terpentinatank (ingemetseld)
631263|white spirit-/terpentinatank (ommuurd)
631243|white spirit-/terpentinatank (ondergronds)
241309|wiedasfabriek
287404|wieldraaierij (metaal)
311002|wikkelinrichting
291101|windmotorenfabriek
174007|windschermfabriek
292402|winkelmachinefabriek
292406|winkelmachinereparatiebedrijf
191028|witleerlooierij
011211|witlofkwekerij
930126|witwasserij
1712|wolbewerking en -spinnerij
17307|wolcarboniseringsbedrijf
1712|wolindustrie
201023|wolmaniseerbedrijf
1712|wolspinnerij
171201|woltwijnderij
17301|wolververij
1712|wolvezelbewerkende fabriek
171204|wolwasserij
1722|wolweverij
3515|woonbotenwerf
151322|worstfabriek
24515|wrijfwasfabriek
202006|xylolithfabriek
011216|zaadkwekerij
51212|zaai- en pootgoedgroothandel
192001|zadel- en ledermakerij
192001|zadelmakerij
51212|zaden- en peulvruchtengroothandel
21211|zakkenplakkerij
21211|zakkenrollenfabriek
17303|zakkenstempelinrichting
285203|zandstraalinrichting
222281|zeefdrukkerij
191021|zeem(leer)fabriek
191021|zeemledermolen
191021|zeemleerlooierij
191042|zeemtouwerij
2451|zeep-, was- reinigings- en onderhoudsmiddelenindustrie
24511|zeepfabriek
245111|zeepziederij
243022|zegellakfabriek
174002|zeilen-, tenten- en dekkledenfabriek
174002|zeilfabriek
174002|zeilmakerij
900056|zelling met agrarisch afval en/of takkenbossen
900053|zelling met baggerspecie
900059|zelling met grond
900054|zelling met houtafval
900052|zelling met huishoudelijk afval
900051|zelling met industrieel- en bedrijfsafval
900055|zelling met lompen
900057|zelling met puin en/of bouw- en sloopafval
32201|zend- en signaalapparatenfabriek
156203|zetmeel- en zetmeelderivatenindustrie
156203|zetmeel- en zetmeelderivatenindustrie (aardappelmeelfabrieken)
222402|zetterij
2862|zevenfabriek
2862|zevenmakerij
8511|ziekenhuis
17301|zijdeververij
287303|zilverdraadtrekkerij
287403|zilverdrijverij
362202|zilversmelterij/-gieterij
362202|zilverwerkfabriek
222275|zincografische drukkerij
27433|zinkfabriek (primair)
284005|zinkpletterij
287702|zinkslagerij
287702|zinkwerkerij
287703|zinkwerkfabriek
241213|zinkwitfabriek
241213|zinkwitfabriek/-molen
241213|zinkwitmolen
174007|zon- en windschermenfabriek
174007|zonneschermfabriek
453401|zonwering- en rolluikeninstallatiebedrijf
453401|zonweringinstallatiebedrijf
191023|zoolleerlooierij
14401|zoutfabriek
1440|zoutwinning
14402|zoutziederij
14402|zoutziederij (19e eeuw)
241311|zoutzuurfabriek
15513|zuivelconservenfabriek
15511|zuivelfabriek
155|zuivelindustrie
731012|zuivelonderzoeksinstituut
295301|zuivelwerktuigenfabriek
292406|zuivelwerktuigenreparatiebedrijf
153203|zwarte siroopfabriek
24121|zwartselfabriek
17301|zwartververij
241425|zwavelfabriek
241425|zwavelfabriek en -stokerij
24682|zwavelgieterij
241228|zwavelkleurstoffenindustrie
191029|zwavelleerlooierij
241425|zwavelstokerij
24682|zwavelstokkenfabriek
241312|zwavelzure ammoniakfabriek
241303|zwavelzuurfabriek
453403|zwembadeninstallatiebedrijf
192009|zwepenmakerij
`;

/** Omschrijvingen vergelijkbaar maken: kleine letters, één spatie, geen slotpunt */
function normaliseer(s) {
    return String(s).toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '').trim();
}

let index = null;
function getIndex() {
    if (!index) {
        index = new Map();
        for (const regel of UBI_LIJST.split('\n')) {
            const streep = regel.indexOf('|');
            if (streep === -1) continue;
            const omschrijving = regel.slice(streep + 1);
            const sleutel = normaliseer(omschrijving);
            if (!index.has(sleutel)) {
                index.set(sleutel, { code: regel.slice(0, streep), omschrijving });
            }
        }
    }
    return index;
}

/**
 * Zoek de UBI-code bij een activiteitomschrijving.
 * Geeft de code mét "UBI"-voorvoegsel terug ("UBI631241"), zoals het sjabloon
 * hem schrijft, of een lege string als de omschrijving niet in de lijst staat.
 */
export function zoekUbiCode(omschrijving) {
    if (!omschrijving) return '';
    const treffer = getIndex().get(normaliseer(omschrijving));
    return treffer ? `UBI${treffer.code}` : '';
}

/**
 * Herstel een omschrijving die door een paginawissel is afgekapt.
 *
 * De PDF tekent een cel die over een paginagrens breekt in twee stukken; het
 * staartstuk belandt elders in de tekststroom, zodat er bijvoorbeeld alleen
 * "chemische" overblijft van "chemische afvalstoffenopslag/kca-depot".
 * Staat de naam niet in de lijst, dan zoeken we de UBI-omschrijvingen die
 * ermee beginnen en houden we die over waarvan het ontbrekende staartstuk
 * elders in de rapportage voorkomt. De langste winnaar is de juiste: een
 * kortere kandidaat is altijd óók een prefix van een langere, dus alleen de
 * langste dekt de volledige tekst. Bij een gelijkspel laten we de naam staan.
 */
export function volledigeUbiOmschrijving(naam, context = '') {
    const genormaliseerd = normaliseer(naam);
    if (!genormaliseerd || getIndex().has(genormaliseerd)) return naam;

    const contextNorm = normaliseer(context);
    let beste = null;
    let gelijkspel = false;
    for (const [sleutel, treffer] of getIndex()) {
        if (!sleutel.startsWith(genormaliseerd + ' ')) continue;
        const staart = sleutel.slice(genormaliseerd.length + 1);
        if (!staart || !contextNorm.includes(staart)) continue;
        if (!beste || sleutel.length > beste.sleutel.length) {
            beste = { sleutel, omschrijving: treffer.omschrijving };
            gelijkspel = false;
        } else if (sleutel.length === beste.sleutel.length) {
            gelijkspel = true;
        }
    }
    return beste && !gelijkspel ? beste.omschrijving : naam;
}
