/**
 * 測定カテゴリ（毛穴・シミ・シワ等）まわりの多言語対訳。
 *
 * 日本語（正本）は scoring.js の CATEGORY_CONFIG / CUSTOMER_FRIENDLY_DESC /
 * RATIONALE_TEMPLATES / TREATMENT_MENU / TREATMENT_FREQUENCY /
 * TREATMENT_HOMECARE / CATEGORY_CHECK_QUESTIONS をそのまま正本として使い、
 * ここでは英語・ポーランド語の対訳だけを持つ（二重管理を避けるため）。
 * スコア算出ロジック自体（scoring.js）はどの言語でも共通・不変。
 */
import { getLang } from "./i18n.js";
import {
  CATEGORY_CONFIG,
  CUSTOMER_FRIENDLY_DESC,
  RATIONALE_TEMPLATES,
  TREATMENT_MENU,
  TREATMENT_FREQUENCY,
  TREATMENT_HOMECARE,
  CATEGORY_CHECK_QUESTIONS,
} from "./scoring.js";

const LABEL_EN = {
  pore_cheek: "Visible pores (cheeks)",
  pore_nose: "Visible pores (nose)",
  blackhead_nose: "Blackheads (nose)",
  blackhead_cheek: "Blackheads (cheeks)",
  texture_uniformity: "Skin texture evenness",
  spots: "Spots & pigmentation",
  dullness: "Uneven tone & dullness",
  redness_cheek: "Redness (cheeks)",
  redness_tzone: "Redness (T-zone)",
  acne: "Acne & inflammation",
  wrinkle_forehead: "Forehead wrinkles",
  wrinkle_glabella: "Glabellar lines (between brows)",
  wrinkle_crowfeet: "Crow's feet",
  wrinkle_nasolabial: "Nasolabial folds",
  dark_circle: "Under-eye dark circles",
  brightness: "Brightness & radiance",
  shine: "Shine / oil balance",
};

const LABEL_PL = {
  pore_cheek: "Widoczne pory (policzki)",
  pore_nose: "Widoczne pory (nos)",
  blackhead_nose: "Zaskórniki (nos)",
  blackhead_cheek: "Zaskórniki (policzki)",
  texture_uniformity: "Równomierność tekstury skóry",
  spots: "Przebarwienia i plamy",
  dullness: "Nierówny koloryt i szarość cery",
  redness_cheek: "Zaczerwienienie (policzki)",
  redness_tzone: "Zaczerwienienie (strefa T)",
  acne: "Trądzik i stany zapalne",
  wrinkle_forehead: "Zmarszczki na czole",
  wrinkle_glabella: "Zmarszczki między brwiami",
  wrinkle_crowfeet: "Kurze łapki",
  wrinkle_nasolabial: "Bruzdy nosowo-wargowe",
  dark_circle: "Cienie pod oczami",
  brightness: "Jasność i blask skóry",
  shine: "Błyszczenie / balans sebum",
};

const DESC_EN = {
  pore_cheek: "How open/visible the pores are around your cheeks",
  pore_nose: "How open/visible the pores are around your nose",
  blackhead_nose: "Blackheads on the nose (clogged pores/sebum)",
  blackhead_cheek: "Blackheads on the cheeks",
  texture_uniformity: "How smooth and even your skin texture is",
  spots: "How visible spots/pigmentation are",
  dullness: "Overall unevenness/dullness of skin tone",
  redness_cheek: "Strength of redness on the cheeks",
  redness_tzone: "Strength of redness on the forehead/nose (T-zone)",
  acne: "Condition of acne/inflammatory breakouts",
  wrinkle_forehead: "Visibility of forehead wrinkles",
  wrinkle_glabella: "Visibility of lines between the brows",
  wrinkle_crowfeet: "Visibility of crow's feet (laugh lines)",
  wrinkle_nasolabial: "Visibility of nasolabial folds",
  dark_circle: "Visibility of under-eye dark circles",
  brightness: "Brightness and radiance of the skin",
  shine: "Shine and oil balance of the skin",
};

const DESC_PL = {
  pore_cheek: "Stopień widoczności/rozszerzenia porów na policzkach",
  pore_nose: "Stopień widoczności/rozszerzenia porów wokół nosa",
  blackhead_nose: "Zaskórniki na nosie (zatkane pory/sebum)",
  blackhead_cheek: "Zaskórniki na policzkach",
  texture_uniformity: "Gładkość i równomierność tekstury skóry",
  spots: "Widoczność przebarwień/plam",
  dullness: "Ogólna nierównomierność/szarość kolorytu skóry",
  redness_cheek: "Intensywność zaczerwienienia na policzkach",
  redness_tzone: "Intensywność zaczerwienienia w strefie T (czoło/nos)",
  acne: "Stan trądziku/zmian zapalnych",
  wrinkle_forehead: "Widoczność zmarszczek na czole",
  wrinkle_glabella: "Widoczność zmarszczek między brwiami",
  wrinkle_crowfeet: "Widoczność kurzych łapek",
  wrinkle_nasolabial: "Widoczność bruzd nosowo-wargowych",
  dark_circle: "Widoczność cieni pod oczami",
  brightness: "Jasność i blask skóry",
  shine: "Błyszczenie i balans sebum skóry",
};

const RATIONALE_EN = {
  pore_cheek: "Measures local surface roughness (Laplacian variance) in the cheek area. Measured value {value} (relative value; higher means more visible pores/roughness).",
  pore_nose: "Measures local surface roughness (Laplacian variance) in the nose area. Measured value {value} (relative value; higher means more visible pores/roughness).",
  blackhead_nose: "Detects small blobs darker than the surroundings (clogged-pore-like spots) in the nose area and calculates their area ratio. Measured value {value} (higher means more visible blackheads).",
  blackhead_cheek: "Detects small blobs darker than the surroundings in the cheek area and calculates their area ratio. Measured value {value} (higher means more visible blackheads).",
  texture_uniformity: "Divides the forehead/cheek area into 20x20 blocks and measures the variation in texture between blocks. Measured value {value} (higher means some areas have noticeably rougher texture).",
  spots: "Detects relatively large, darker pigmentation blobs across the forehead/cheeks/nose/chin and calculates their area ratio. Measured value {value} (higher means more visible spots).",
  dullness: "Calculates the standard deviation of brightness (L) in LAB color space to measure skin-tone unevenness. Measured value {value} (higher means more unevenness).",
  redness_cheek: "Calculates the average a* value (green-red axis) in LAB color space for the cheeks. Measured value {value} (higher means stronger redness).",
  redness_tzone: "Calculates the average a* value in LAB color space for the T-zone (forehead/nose/glabella). Measured value {value} (higher means stronger redness).",
  acne: "Detects small regions where the a* value is higher than surroundings (inflamed areas) and calculates their area ratio. Measured value {value} (higher means more visible inflammatory trouble).",
  wrinkle_forehead: "Calculates line-edge density in the forehead area using edge detection auto-adjusted to the photo's brightness. Measured value {value} (higher means more wrinkles/lines).",
  wrinkle_glabella: "Calculates edge density between the brows the same way. Measured value {value} (higher means more wrinkles/lines).",
  wrinkle_crowfeet: "Calculates edge density around the outer eyes the same way. Measured value {value} (higher means more wrinkles/lines).",
  wrinkle_nasolabial: "Calculates edge density around the nasolabial folds the same way. Measured value {value} (higher means more wrinkles/lines).",
  dark_circle: "Calculates the difference between cheek brightness (L) and under-eye brightness (L). Measured value {value} (higher means darker, more visible circles).",
  brightness: "Calculates average brightness (L) in LAB color space on a 0-100 scale. Measured value {value} (higher means brighter, more radiant skin).",
  shine: "Calculates the ratio of high-brightness, low-saturation highlight pixels (shine/reflection) in HSV color space. Measured value {value} (higher means more shine).",
};

const RATIONALE_PL = {
  pore_cheek: "Mierzy lokalną chropowatość powierzchni (wariancja Laplace'a) w obszarze policzków. Wartość zmierzona {value} (wartość względna; im wyższa, tym bardziej widoczne pory/chropowatość).",
  pore_nose: "Mierzy lokalną chropowatość powierzchni (wariancja Laplace'a) w obszarze nosa. Wartość zmierzona {value} (wartość względna; im wyższa, tym bardziej widoczne pory/chropowatość).",
  blackhead_nose: "Wykrywa małe ciemne plamki ciemniejsze niż otoczenie w obszarze nosa i oblicza ich udział powierzchniowy. Wartość zmierzona {value} (im wyższa, tym bardziej widoczne zaskórniki).",
  blackhead_cheek: "Wykrywa małe ciemne plamki ciemniejsze niż otoczenie w obszarze policzków i oblicza ich udział powierzchniowy. Wartość zmierzona {value} (im wyższa, tym bardziej widoczne zaskórniki).",
  texture_uniformity: "Dzieli obszar czoła/policzków na bloki 20x20 i mierzy zróżnicowanie tekstury między blokami. Wartość zmierzona {value} (im wyższa, tym bardziej nierówna tekstura w niektórych miejscach).",
  spots: "Wykrywa stosunkowo duże, ciemniejsze plamy przebarwień w obszarze czoła/policzków/nosa/podbródka i oblicza ich udział powierzchniowy. Wartość zmierzona {value} (im wyższa, tym bardziej widoczne plamy).",
  dullness: "Oblicza odchylenie standardowe jasności (L) w przestrzeni barw LAB, mierząc nierównomierność kolorytu skóry. Wartość zmierzona {value} (im wyższa, tym większa nierównomierność).",
  redness_cheek: "Oblicza średnią wartość a* (oś zielono-czerwona) w przestrzeni barw LAB dla policzków. Wartość zmierzona {value} (im wyższa, tym silniejsze zaczerwienienie).",
  redness_tzone: "Oblicza średnią wartość a* w przestrzeni barw LAB dla strefy T (czoło/nos/gładzizna). Wartość zmierzona {value} (im wyższa, tym silniejsze zaczerwienienie).",
  acne: "Wykrywa małe obszary, w których wartość a* jest wyższa niż w otoczeniu (obszary zapalne) i oblicza ich udział powierzchniowy. Wartość zmierzona {value} (im wyższa, tym bardziej widoczne zmiany zapalne).",
  wrinkle_forehead: "Oblicza gęstość linii krawędziowych w obszarze czoła za pomocą detekcji krawędzi dostosowanej do jasności zdjęcia. Wartość zmierzona {value} (im wyższa, tym więcej zmarszczek/linii).",
  wrinkle_glabella: "Oblicza gęstość krawędzi między brwiami w ten sam sposób. Wartość zmierzona {value} (im wyższa, tym więcej zmarszczek/linii).",
  wrinkle_crowfeet: "Oblicza gęstość krawędzi w obszarze zewnętrznych kącików oczu w ten sam sposób. Wartość zmierzona {value} (im wyższa, tym więcej zmarszczek/linii).",
  wrinkle_nasolabial: "Oblicza gęstość krawędzi wokół bruzd nosowo-wargowych w ten sam sposób. Wartość zmierzona {value} (im wyższa, tym więcej zmarszczek/linii).",
  dark_circle: "Oblicza różnicę między jasnością (L) policzków a jasnością (L) okolicy pod oczami. Wartość zmierzona {value} (im wyższa, tym ciemniejsze i bardziej widoczne cienie).",
  brightness: "Oblicza średnią jasność (L) w przestrzeni barw LAB w skali 0-100. Wartość zmierzona {value} (im wyższa, tym jaśniejsza i bardziej promienna skóra).",
  shine: "Oblicza udział pikseli o wysokiej jasności i niskim nasyceniu (połysk/odbicia) w przestrzeni barw HSV. Wartość zmierzona {value} (im wyższa, tym więcej połysku).",
};

const MENU_EN = {
  pore_cheek: ["Pore Cleansing Course", "Dermapen", "Hydrafacial"],
  pore_nose: ["Nose Pore Pack", "Pore Cleansing Course", "Dermapen"],
  blackhead_nose: ["Pore Cleansing Course", "Dermapen", "Hydrafacial"],
  blackhead_cheek: ["Pore Cleansing Course", "Dermapen", "Hydrafacial"],
  texture_uniformity: ["Peeling", "Vitamin C Iontophoresis Course"],
  spots: ["Whitening Iontophoresis", "Dermapen", "Peeling + Whitening Pack"],
  dullness: ["Hydrafacial", "Vitamin C Iontophoresis Course"],
  redness_cheek: ["Calming Pack", "Redness-focused Iontophoresis"],
  redness_tzone: ["Calming Pack", "Sebum Control Care"],
  acne: ["Acne Care Course", "Salicylic Acid Peeling"],
  wrinkle_forehead: ["Mesotherapy", "EMS/RF Lift Care", "Collagen Iontophoresis Course"],
  wrinkle_glabella: ["Mesotherapy", "EMS/RF Lift Care", "Collagen Iontophoresis Course"],
  wrinkle_crowfeet: ["Mesotherapy", "Eye-Care Beauty Acupuncture", "Collagen Iontophoresis Course"],
  wrinkle_nasolabial: ["Mesotherapy", "Lift-Up Facial", "EMS/RF Lift Care"],
  dark_circle: ["Mesotherapy", "Eye-Care Beauty Acupuncture", "Circulation Massage"],
  brightness: ["Hydrafacial", "Vitamin C Iontophoresis Course"],
  shine: ["Sebum Control Care", "Clay Pack"],
};

const MENU_PL = {
  pore_cheek: ["Zabieg oczyszczania porów", "Dermapen", "Hydrafacial"],
  pore_nose: ["Plaster na pory nosa", "Zabieg oczyszczania porów", "Dermapen"],
  blackhead_nose: ["Zabieg oczyszczania porów", "Dermapen", "Hydrafacial"],
  blackhead_cheek: ["Zabieg oczyszczania porów", "Dermapen", "Hydrafacial"],
  texture_uniformity: ["Peeling", "Kurs jontoforezy z witaminą C"],
  spots: ["Jontoforeza wybielająca", "Dermapen", "Peeling + maska wybielająca"],
  dullness: ["Hydrafacial", "Kurs jontoforezy z witaminą C"],
  redness_cheek: ["Maska kojąca", "Jontoforeza na zaczerwienienia"],
  redness_tzone: ["Maska kojąca", "Pielęgnacja kontrolująca sebum"],
  acne: ["Kurs pielęgnacji trądziku", "Peeling kwasem salicylowym"],
  wrinkle_forehead: ["Mezoterapia", "Lifting EMS/RF", "Kurs jontoforezy z kolagenem"],
  wrinkle_glabella: ["Mezoterapia", "Lifting EMS/RF", "Kurs jontoforezy z kolagenem"],
  wrinkle_crowfeet: ["Mezoterapia", "Akupunktura kosmetyczna okolic oczu", "Kurs jontoforezy z kolagenem"],
  wrinkle_nasolabial: ["Mezoterapia", "Zabieg liftingujący twarz", "Lifting EMS/RF"],
  dark_circle: ["Mezoterapia", "Akupunktura kosmetyczna okolic oczu", "Masaż poprawiający krążenie"],
  brightness: ["Hydrafacial", "Kurs jontoforezy z witaminą C"],
  shine: ["Pielęgnacja kontrolująca sebum", "Maska z glinki"],
};

const FREQ_EN = {
  pore_cheek: "Pore Cleansing Course: every 2-4 weeks / Dermapen: every 3-4 weeks",
  pore_nose: "Pore Cleansing Course: every 2-4 weeks / Dermapen: every 3-4 weeks",
  blackhead_nose: "Pore Cleansing Course: every 2-4 weeks / Dermapen: every 3-4 weeks",
  blackhead_cheek: "Pore Cleansing Course: every 2-4 weeks / Dermapen: every 3-4 weeks",
  texture_uniformity: "Every 2-4 weeks, 4-6 session course recommended",
  spots: "Whitening Iontophoresis: every 2-4 weeks, 6-10 session course (consistency is key) / Dermapen: every 3-4 weeks",
  dullness: "Every 2-4 weeks, 4-6 session course recommended",
  redness_cheek: "Every 2-4 weeks, 4-6 session course (centered on calming care)",
  redness_tzone: "Every 2-4 weeks, 4-6 session course recommended",
  acne: "Every 2-4 weeks, 4-6 session course recommended (if inflammation is severe, combining with dermatology care is advised)",
  wrinkle_forehead: "Mesotherapy: every 3-4 weeks, 4+ sessions recommended",
  wrinkle_glabella: "Mesotherapy: every 3-4 weeks, 4+ sessions recommended",
  wrinkle_crowfeet: "Mesotherapy: every 3-4 weeks, 4+ sessions recommended",
  wrinkle_nasolabial: "Mesotherapy: every 3-4 weeks, 4+ sessions recommended",
  dark_circle: "Mesotherapy: every 3-4 weeks, 4+ sessions recommended",
  brightness: "Every 2-4 weeks, 4-6 session course recommended",
  shine: "Every 2-4 weeks, 4-6 session course recommended (sebum control)",
};

const FREQ_PL = {
  pore_cheek: "Zabieg oczyszczania porów: co 2-4 tygodnie / Dermapen: co 3-4 tygodnie",
  pore_nose: "Zabieg oczyszczania porów: co 2-4 tygodnie / Dermapen: co 3-4 tygodnie",
  blackhead_nose: "Zabieg oczyszczania porów: co 2-4 tygodnie / Dermapen: co 3-4 tygodnie",
  blackhead_cheek: "Zabieg oczyszczania porów: co 2-4 tygodnie / Dermapen: co 3-4 tygodnie",
  texture_uniformity: "Co 2-4 tygodnie, zalecany kurs 4-6 zabiegów",
  spots: "Jontoforeza wybielająca: co 2-4 tygodnie, kurs 6-10 zabiegów (regularność jest kluczowa) / Dermapen: co 3-4 tygodnie",
  dullness: "Co 2-4 tygodnie, zalecany kurs 4-6 zabiegów",
  redness_cheek: "Co 2-4 tygodnie, kurs 4-6 zabiegów (głównie pielęgnacja kojąca)",
  redness_tzone: "Co 2-4 tygodnie, zalecany kurs 4-6 zabiegów",
  acne: "Co 2-4 tygodnie, zalecany kurs 4-6 zabiegów (przy silnym stanie zapalnym zalecana współpraca z dermatologiem)",
  wrinkle_forehead: "Mezoterapia: co 3-4 tygodnie, zalecane min. 4 zabiegi",
  wrinkle_glabella: "Mezoterapia: co 3-4 tygodnie, zalecane min. 4 zabiegi",
  wrinkle_crowfeet: "Mezoterapia: co 3-4 tygodnie, zalecane min. 4 zabiegi",
  wrinkle_nasolabial: "Mezoterapia: co 3-4 tygodnie, zalecane min. 4 zabiegi",
  dark_circle: "Mezoterapia: co 3-4 tygodnie, zalecane min. 4 zabiegi",
  brightness: "Co 2-4 tygodnie, zalecany kurs 4-6 zabiegów",
  shine: "Co 2-4 tygodnie, zalecany kurs 4-6 zabiegów (kontrola sebum)",
};

const HOMECARE_EN = {
  pore_cheek: "Cleanse with lukewarm (not hot) water to open pores, then follow with an astringent toner to tighten them.",
  pore_nose: "The T-zone tends to accumulate oil — try a pore pack or enzyme cleanser once or twice a week.",
  blackhead_nose: "Avoid rubbing blackheads. Gently remove pore build-up with oil cleansing.",
  blackhead_cheek: "Avoid scrubbing; gently cleanse with an enzyme wash once or twice a week. Friction can also cause pigmentation.",
  texture_uniformity: "A weekly peeling routine plus morning/evening moisturizing helps even out texture.",
  spots: "Always apply sunscreen during the day — thorough UV protection is the top priority.",
  dullness: "Adequate moisturizing, sleep, and continued use of vitamin C skincare are the fastest route to reducing dullness.",
  redness_cheek: "Switch to a low-irritation skincare routine and avoid rubbing the skin.",
  redness_tzone: "Oil/dryness balance breaks down easily here — switch to a moisture-focused routine.",
  acne: "Keep things that touch your skin (pillowcases, phone screen) clean, and go easy on heavy, oily skincare.",
  wrinkle_forehead: "Massage to relax facial tension, plus a morning/evening moisturizing habit.",
  wrinkle_glabella: "If you tend to tense this area, consciously relax it. Continue moisturizing cream care too.",
  wrinkle_crowfeet: "The eye area has thin, delicate skin — moisturize gently with a dedicated eye cream.",
  wrinkle_nasolabial: "Facial exercises, moisturizing, and posture improvement (slouching can emphasize these folds) are worth focusing on.",
  dark_circle: "Mainly caused by lack of sleep and poor circulation. Sleep enough and try warming the eye area with a hot towel.",
  brightness: "Focus on adequate moisturizing and lifestyle habits (sleep, nutrition) that support skin turnover.",
  shine: "Use a gentle cleanser that doesn't strip too much oil, paired with a lightweight moisturizer to balance things out.",
};

const HOMECARE_PL = {
  pore_cheek: "Oczyszczaj twarz letnią (nie gorącą) wodą, aby otworzyć pory, a następnie stosuj tonik ściągający, by je zamknąć.",
  pore_nose: "Strefa T łatwo gromadzi sebum — raz-dwa razy w tygodniu warto sięgnąć po plaster na pory lub peeling enzymatyczny.",
  blackhead_nose: "Unikaj pocierania zaskórników. Delikatnie usuwaj zanieczyszczenia z porów metodą oczyszczania olejkiem.",
  blackhead_cheek: "Nie pocieraj mocno — raz-dwa razy w tygodniu stosuj delikatny peeling enzymatyczny. Tarcie może też powodować przebarwienia.",
  texture_uniformity: "Cotygodniowy peeling oraz nawilżanie rano i wieczorem pomagają wyrównać teksturę skóry.",
  spots: "W ciągu dnia zawsze stosuj filtr przeciwsłoneczny — dokładna ochrona przed UV to podstawa.",
  dullness: "Odpowiednie nawilżenie, sen i regularne stosowanie pielęgnacji z witaminą C to najszybsza droga do redukcji szarości cery.",
  redness_cheek: "Przejdź na łagodną pielęgnację o niskim potencjale drażniącym i unikaj pocierania skóry.",
  redness_tzone: "W tym miejscu łatwo zaburzyć równowagę sebum i nawilżenia — przejdź na pielęgnację skoncentrowaną na nawilżeniu.",
  acne: "Dbaj o czystość rzeczy stykających się ze skórą (poszewka, ekran telefonu) i ogranicz ciężkie, tłuste kosmetyki.",
  wrinkle_forehead: "Masaż rozluźniający mięśnie twarzy oraz nawyk nawilżania rano i wieczorem.",
  wrinkle_glabella: "Jeśli często marszczysz brwi, staraj się świadomie rozluźniać tę okolicę. Kontynuuj też pielęgnację kremem nawilżającym.",
  wrinkle_crowfeet: "Skóra wokół oczu jest cienka i delikatna — nawilżaj ją delikatnie dedykowanym kremem pod oczy.",
  wrinkle_nasolabial: "Warto skupić się na ćwiczeniach mięśni twarzy, nawilżeniu i poprawie postawy (garbienie się pogłębia te bruzdy).",
  dark_circle: "Głównie spowodowane brakiem snu i słabym krążeniem. Zadbaj o sen i spróbuj ciepłego okładu na okolice oczu.",
  brightness: "Skup się na odpowiednim nawilżeniu i nawykach (sen, odżywianie) wspierających odnowę naskórka.",
  shine: "Stosuj łagodne oczyszczanie, które nie usuwa nadmiernie sebum, w połączeniu z lekkim nawilżeniem dla zbalansowania cery.",
};

const QUESTIONS_EN = {
  pore_cheek: ["Have you had any recent buildup of makeup or oil left on your skin?", "Are you moisturizing enough?"],
  pore_nose: ["Have you been keeping up with oil/pore care around your nose?"],
  blackhead_nose: ["Have you been overusing pore strips or scrubbing too hard when washing your face?"],
  blackhead_cheek: ["Have you been scrubbing hard when cleansing?"],
  texture_uniformity: ["Have you had ongoing sleep deprivation or dryness?"],
  spots: ["Have you been keeping up with sun protection (sunscreen)?"],
  dullness: ["Have you had ongoing sleep deprivation or dryness?"],
  redness_cheek: ["Is your cleansing okay? (watch out for scrubbing / hot water)", "Have you felt any irritation from a new cosmetic product?"],
  redness_tzone: ["Have you been scrubbing too hard when cleansing?"],
  acne: ["Is your cleansing okay?", "Any changes in sleep, diet, or pillowcase cleanliness?"],
  wrinkle_forehead: ["Have you kept up with sun protection and moisturizing?", "Do you have a habit of wrinkling your forehead?"],
  wrinkle_glabella: ["Do you tend to tense the area between your brows?", "Are you moisturizing enough?"],
  wrinkle_crowfeet: ["Have you kept up with sun protection and moisturizing?"],
  wrinkle_nasolabial: ["Have you had any sudden weight change or dryness?"],
  dark_circle: ["Has lack of sleep or eye strain from your phone/PC continued?"],
  brightness: ["Have you kept up with sun protection and moisturizing?"],
  shine: ["Is your cleansing/moisturizing balance off? (both over-cleansing and dryness can cause this)"],
};

const QUESTIONS_PL = {
  pore_cheek: ["Czy ostatnio zdarzało się pozostawianie makijażu lub sebum na skórze?", "Czy nawilżasz skórę wystarczająco?"],
  pore_nose: ["Czy kontynuujesz pielęgnację sebum/porów wokół nosa?"],
  blackhead_nose: ["Czy nie nadużywasz plastrów na pory lub nie pocierasz zbyt mocno podczas mycia twarzy?"],
  blackhead_cheek: ["Czy nie pocierasz mocno podczas oczyszczania?"],
  texture_uniformity: ["Czy utrzymuje się brak snu lub przesuszenie skóry?"],
  spots: ["Czy stosujesz ochronę przeciwsłoneczną (filtr SPF)?"],
  dullness: ["Czy utrzymuje się brak snu lub przesuszenie skóry?"],
  redness_cheek: ["Czy Twoje oczyszczanie jest łagodne? (uważaj na pocieranie / gorącą wodę)", "Czy odczuwasz podrażnienie po nowym kosmetyku?"],
  redness_tzone: ["Czy nie pocierasz zbyt mocno podczas oczyszczania?"],
  acne: ["Czy Twoje oczyszczanie jest odpowiednie?", "Czy zaszły zmiany w śnie, diecie lub czystości poszewki na poduszkę?"],
  wrinkle_forehead: ["Czy kontynuujesz ochronę przeciwsłoneczną i nawilżanie?", "Czy masz nawyk marszczenia czoła?"],
  wrinkle_glabella: ["Czy masz tendencję do napinania okolicy między brwiami?", "Czy nawilżasz skórę wystarczająco?"],
  wrinkle_crowfeet: ["Czy kontynuujesz ochronę przeciwsłoneczną i nawilżanie?"],
  wrinkle_nasolabial: ["Czy doszło do gwałtownej zmiany wagi lub przesuszenia skóry?"],
  dark_circle: ["Czy utrzymuje się brak snu lub zmęczenie oczu spowodowane telefonem/komputerem?"],
  brightness: ["Czy kontynuujesz ochronę przeciwsłoneczną i nawilżanie?"],
  shine: ["Czy zaburzona jest równowaga oczyszczania/nawilżania? (zarówno nadmierne oczyszczanie, jak i przesuszenie mogą być przyczyną)"],
};

const _PERCENT_CATEGORIES = new Set([
  "blackhead_nose", "blackhead_cheek", "spots", "acne", "shine",
  "wrinkle_forehead", "wrinkle_glabella", "wrinkle_crowfeet", "wrinkle_nasolabial",
]);
const _SIGNED_CATEGORIES = new Set(["redness_cheek", "redness_tzone", "dark_circle"]);

function _formatRaw(catKey, rawValue) {
  if (_PERCENT_CATEGORIES.has(catKey)) return `${(rawValue * 100).toFixed(2)}%`;
  if (_SIGNED_CATEGORIES.has(catKey)) return `${rawValue >= 0 ? "+" : ""}${rawValue.toFixed(1)}`;
  return rawValue.toFixed(1);
}

function _pick(catKey, jaTable, enTable, plTable) {
  const lang = getLang();
  if (lang === "en") return enTable[catKey] ?? jaTable[catKey];
  if (lang === "pl") return plTable[catKey] ?? jaTable[catKey];
  return jaTable[catKey];
}

/** カテゴリキーから現在言語の表示ラベルを返す。 */
export function categoryLabel(catKey) {
  const ja = CATEGORY_CONFIG[catKey] ? CATEGORY_CONFIG[catKey].label : catKey;
  return _pick(catKey, { [catKey]: ja }, LABEL_EN, LABEL_PL);
}

/** カテゴリキーから現在言語のお客様向け一言説明を返す。 */
export function categoryDesc(catKey) {
  return _pick(catKey, CUSTOMER_FRIENDLY_DESC, DESC_EN, DESC_PL) || "";
}

/** カテゴリキー・実測値から現在言語の算出根拠テキストを返す。 */
export function categoryRationale(catKey, rawValue) {
  if (rawValue === null || rawValue === undefined) {
    const lang = getLang();
    if (lang === "en") return "This could not be measured from this photo.";
    if (lang === "pl") return "Nie udało się zmierzyć tego na podstawie tego zdjęcia.";
    return "この写真では測定できませんでした。";
  }
  const template = _pick(catKey, RATIONALE_TEMPLATES, RATIONALE_EN, RATIONALE_PL);
  if (!template) return "";
  return template.replace("{value}", _formatRaw(catKey, rawValue));
}

/** カテゴリキーからおすすめ施術メニュー配列（現在言語）を返す。 */
export function treatmentMenu(catKey) {
  return _pick(catKey, TREATMENT_MENU, MENU_EN, MENU_PL) || [];
}

/** カテゴリキーから施術目安頻度（現在言語）を返す。 */
export function treatmentFrequency(catKey) {
  return _pick(catKey, TREATMENT_FREQUENCY, FREQ_EN, FREQ_PL) || "";
}

/** カテゴリキーからホームケアアドバイス（現在言語）を返す。 */
export function treatmentHomecare(catKey) {
  return _pick(catKey, TREATMENT_HOMECARE, HOMECARE_EN, HOMECARE_PL) || "";
}

/** カテゴリキーから確認質問配列（現在言語）を返す。 */
export function checkQuestions(catKey) {
  return _pick(catKey, CATEGORY_CHECK_QUESTIONS, QUESTIONS_EN, QUESTIONS_PL) || [];
}
