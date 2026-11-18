# Motion Studio : format des motions

Un motion est un projet de motion design, stocké en JSON par le serveur (`data/motions/<id>.json`) et ouvert dans l'éditeur (`#/m/<id>`). L'éditeur tourne dans le navigateur : galerie, viewer, timeline avec images clés, inspecteur, calques scriptés en Canvas 2D et Three.js (WebGL r170 et WebGPU r187), vidéos (rushes, captures d'écran), sons, export MP4/WebM et PNG. L'export vidéo encode image par image avec WebCodecs (H.264 en MP4, horodatage exact de chaque image ; les sons sont mixés hors ligne et encodés en AAC 48 kHz dans le même fichier, calés à l'échantillon près grâce à une liste d'édition MP4 qui retire l'amorce de l'encodeur) : la vidéo est fluide même si l'appareil calcule lentement ; MediaRecorder, en temps réel, ne sert que de repli quand WebCodecs manque.

Le format est pensé pour être écrit par un script ou un agent IA : il écrit le JSON, le pousse, et un éditeur ouvert se recharge aussitôt. La personne retouche à la main, puis laisse des retours épinglés à un instant précis (bouton Retours de l'éditeur, repère sur la règle) que l'agent relit avec `tools/motion.ts feedback`.

## Boucle de travail

```bash
bun tools/motion.ts push projet.json mon-motion   # crée ou remplace, affiche le lien de l'éditeur
bun tools/motion.ts pull mon-motion projet.json   # récupère la version retouchée dans l'éditeur
bun tools/motion.ts list
bun tools/motion.ts media capture.png logo.svg    # envoie des fichiers, affiche leur chemin /media/...
bun tools/motion.ts feedback                      # retours ouverts, avec le motion et l'instant
bun tools/motion.ts done 3 "Titre agrandi"        # répond à un retour et le marque fait
```

Avant de modifier un motion qui a pu être retouché dans l'éditeur, toujours faire `pull` d'abord : `push` remplace tout le document. Un `push` d'un fichier qui porte `rev` échoue (409) si le motion a changé depuis ; `--force` passe outre.

## Document

```json
{
  "name": "Ident · Studio",
  "width": 1920, "height": 1080, "fps": 30, "duration": 7,
  "background": "#06070b",
  "poster_time": 3.5,
  "layers": [ ... ]
}
```

- `layers` : le premier calque de la liste est au premier plan (comme After Effects).
- `poster_time` (optionnel) : instant utilisé pour la vignette de la galerie, sinon la moitié de la durée.
- Champs gérés par le serveur, ignorés à l'envoi : `id`, `rev`, `updated_at`, `updated_by`, `created_at`. `poster` est produit par l'éditeur.

## Calque

```json
{
  "id": "title", "name": "Titre", "type": "text",
  "in": 2.5, "out": 7,
  "blend": "screen", "hidden": false, "locked": false,
  "props": { ... },
  "code": "...", "params": { ... }
}
```

- `type` : `text`, `shape`, `image`, `video`, `canvas`, `three`, `three-gpu`, `audio`.
- `in` / `out` : intervalle visible, en secondes de composition.
- `blend` : `normal` (défaut), `screen`, `add`, `multiply`, `overlay`, `difference`.
- `code` et `params` : calques scriptés (`canvas`, `three`, `three-gpu`) seulement.
- `backend` : calque `three-gpu` seulement, `"webgl"` pour forcer le moteur WebGL 2 de three r187 (sinon WebGPU, et WebGL 2 d'office si le navigateur n'a pas WebGPU). Réglage « Rendu » de l'inspecteur.
- `assets` : calques scriptés seulement. Images à fournir au script, `{ "nom": "/media/…" }` (envoyées avec `tools/motion.ts media` ou `POST /api/media`). L'éditeur les charge et les décode avant de lancer le script : elles sont prêtes dès la première image.

## Propriétés et images clés

Toute propriété est soit une valeur fixe, soit une liste d'images clés :

```json
"opacity": [{ "t": 0, "v": 0, "e": "outCubic" }, { "t": 0.8, "v": 1 }]
```

- `t` : temps de composition (secondes), pas relatif au calque. Déplacer un calque dans la timeline déplace ses images clés.
- `e` : interpolation de cette clé vers la suivante. `linear`, `inSine`, `outSine`, `inOutSine`, `inCubic`, `outCubic`, `inOutCubic`, `inQuart`, `outQuart`, `inOutQuart`, `inExpo`, `outExpo`, `inOutExpo`, `inBack`, `outBack`, `inOutBack`, `outElastic`, `outBounce`, `hold`.
- Nombres et couleurs hexadécimales (`#rrggbb`, `#rrggbbaa`) s'interpolent ; le texte change d'un coup.

Communes à tous les calques (ancre au centre) : `x`, `y` (défaut : centre de l'image), `scale`, `scaleX`, `scaleY`, `rotation` (degrés), `opacity` (0-1), `blur` (px).

| Type | Propriétés |
|---|---|
| `text` | `text` (`\n` pour les lignes), `font` (`Inter`, `Space Grotesk`, `Instrument Serif`, `JetBrains Mono`, `Bricolage Grotesque`, `system-ui`), `weight` (`"300"` à `"800"`), `italic`, `size`, `tracking` (px), `lineHeight`, `align` (`center`, `left`, `right` : ancre à gauche ou à droite), `fill`, `fill2` + `gradientAngle` (dégradé), `glow`, `reveal` (0-1, révélation lettre par lettre), `revealStyle` (`rise`, `fade`, `scale`, `blur`, `type`) |
| `shape` | `shape` (`rect`, `ellipse`, `polygon`, `star`, `line`), `w`, `h`, `radius`, `sides`, `fill` (vide = aucun), `fill2`, `gradientAngle`, `stroke`, `strokeWidth`, `trim` (0-1, tracé progressif du contour), `glow` |
| `image` | `src` (URL, ou `/media/…` envoyé par `tools/motion.ts media`), `w`, `h`, `fit` (`cover`, `contain`, `fill`), `radius` |
| `video` | `src` (`/media/….mp4`, `.mov` ou `.webm`, en général le `src` d'un asset vidéo), `w`, `h`, `fit`, `radius` comme `image` ; `offset`, `volume`, `muted` : voir « Vidéos » |
| `canvas`, `three`, `three-gpu` | `w`, `h` : taille de la surface (défaut : la composition) |
| `audio` | `src`, `volume` (1 = niveau du fichier, jusqu'à 4), `offset`, `fadeIn`, `fadeOut` : voir « Sons » ; pas de transformation |

## Sons

Un calque `audio` est un extrait de fichier son posé sur la timeline : il démarre à `in`, lit le fichier à partir de `offset` secondes et s'arrête à `out` (ou à la fin du fichier). Il ne dessine rien ; l'ordre des calques ne compte pas pour lui (l'éditeur range les sons en bas).

```json
{
  "id": "whoosh1", "name": "Whoosh", "type": "audio", "in": 1.2, "out": 2.1,
  "props": {
    "src": "/media/whoosh.m4a",
    "volume": [{ "t": 1.2, "v": 1 }, { "t": 2.1, "v": 0.4 }],
    "offset": 0, "fadeIn": 0, "fadeOut": 0.2
  }
}
```

- `src` : un son envoyé par `tools/motion.ts media` ou `POST /api/media`, ou un son de la bibliothèque facultative (`/sfx/…`) (`/media/…`, MP3, WAV, OGG, FLAC, M4A).
- `volume` : seule propriété qui prend des images clés (temps de composition, comme ailleurs). Multiplié par les fondus `fadeIn` / `fadeOut` (secondes, au début et à la fin du calque).
- `hidden: true` coupe le son (l'œil de la timeline).
- Dans l'éditeur : bouton « Son et SFX » de la barre d'outils (touche `S`) pour parcourir, écouter et ajouter au temps courant, ou importer un fichier ; « Remplacer le son » dans l'inspecteur. Rogner le début d'un clip avance `offset` pour que le son reste calé ; la fin ne dépasse pas celle du fichier. La lecture suit l'horloge audio, le défilement de la tête fait entendre le son.
- Mettre le son pile sur l'image : un whoosh commence 0,1 à 0,2 s avant le mouvement qu'il accompagne, un impact tombe sur l'image où l'objet arrive.

### Bibliothèque de sons (facultative)

Aucun son n'est fourni. Pour avoir une bibliothèque dans le bouton « Son et SFX », poser les fichiers dans `DATA_DIR/sfx/` avec un `index.json` qui décrit `packs > categories > items` (`id`, `name`, `src`, `dur` en secondes), les `src` en `/sfx/...` :

```json
{ "packs": [{ "id": "base", "name": "Base", "categories": [{ "id": "whooshes", "name": "Whooshes", "items": [
  { "id": "w1", "name": "Whoosh rapide", "src": "/sfx/base/whoosh-fast.m4a", "dur": 0.8 }
] }] }] }
```

## Vidéos

Un calque `video` est un extrait de rush ou de capture d'écran posé sur la timeline, avec les transformations d'un calque `image`. Comme un son, il commence à `in`, montre le fichier à partir de `offset` secondes et s'arrête à `out` ; à la fin du fichier, la dernière image reste affichée.

```json
{
  "id": "demo", "name": "Capture de l'app", "type": "video", "in": 1, "out": 6.5,
  "props": {
    "src": "/media/k3j9x2.mp4",
    "w": 1600, "h": 900, "fit": "cover", "radius": 24,
    "scale": [{ "t": 1, "v": 0.9, "e": "outCubic" }, { "t": 2, "v": 1 }],
    "offset": 12.4, "volume": 0.8, "muted": false
  }
}
```

- `src` : une vidéo envoyée comme asset (`tools/motion.ts media`, ou Importer dans l'éditeur ; `/api/media/stream`, 4 Go max). MP4 en H.264 et WebM se lisent partout ; un MOV en HEVC ne se lit que dans Safari.
- `offset` : instant du fichier montré à l'entrée du calque (secondes, pas d'images clés). Rogner le début du clip dans la timeline l'avance pour que l'image reste calée ; la fin ne dépasse pas celle du fichier.
- `volume` (images clés, jusqu'à 4) et `muted` : le son de la vidéo est joué et mixé dans l'export comme un calque `audio`. Il est décodé à partir du fichier entier : au-delà de 1,5 Go la vidéo reste muette (couper le rush avant). Une vidéo sans piste son est muette d'office. `hidden: true` coupe l'image et le son.
- Dans l'éditeur : bouton Vidéo de la barre d'outils pour choisir parmi les vidéos importées (ou importer un fichier, ou coller une adresse) ; la vidéo est ajoutée au temps courant, à sa durée réelle, ajustée dans l'image. « Changer de vidéo » dans l'inspecteur garde la place et les réglages.
- Aperçu : la vidéo joue en même temps que la tête de lecture et se recale si elle dérive. Export : chaque image est cherchée dans le fichier et décodée avant d'être dessinée, l'export est exact à l'image près même si l'appareil est lent.

## Calques scriptés

Le script s'exécute dans un iframe isolé (aucun accès à l'application, à ses cookies ni à son API). Il définit `render(s)`, appelé à chaque image, et `setup(s)` facultatif, appelé une fois. Le rendu doit dépendre **du temps seulement** (`s.t`) : la timeline se parcourt dans tous les sens et l'export rend chaque image dans l'ordre. Pas de `Math.random()` dans `render` : utiliser `s.rand(seed)` dans `setup`, ou `s.noise`.

Objet `s` :

- Temps : `t` (secondes depuis l'entrée du calque), `time` (temps de composition), `p` (progression 0-1 du calque), `dur`, `frame`, `fps`.
- Surface : `w`, `h`, `scale` (qualité de l'aperçu ; le dessin reste en pixels de composition).
- `params` : valeurs de `layer.params` au temps courant. Nombres et couleurs s'animent en images clés et se règlent dans l'inspecteur : c'est le pont entre le code et la retouche à la main.
- Outils : `range(t, a, b, ease?)` (progression lissée de `t` entre `a` et `b`), `ease.{linear, inOutSine, outCubic, inOutCubic, outQuart, outExpo, inOutExpo, outBack, outElastic}`, `lerp`, `clamp`, `map`, `smooth`, `fract`, `noise(x, y, z)` (Perlin, -1 à 1), `rand(seed)` (générateur déterministe), `TAU`, `log(...)` (console de l'inspecteur).
- Images : `assets.<nom>` (ImageBitmap des `assets` du calque), à dessiner avec `ctx.drawImage` ; en Three.js, `texture(nom)` en fait une texture sRGB (mise en cache). Pour un écran animé (iris, zoom, défilement), dessiner les images dans un canvas 2D à soi à chaque image et s'en servir comme `CanvasTexture` (`needsUpdate = true`).
- `canvas` : `ctx` (Canvas 2D, effacé avant chaque image). Les polices du tableau ci-dessus sont chargées.
- `three` : `THREE` (r170), `scene`, `camera` (perspective 35°, en z = 10), `renderer` (ACES, sRGB, fond transparent), `env(options)` (éclairage studio préfiltré pour les matériaux PBR ; options `intensity`, `warm`, `cool`), `roundedBox(l, h, p, rayon, segments = 4)` (géométrie de boîte aux arêtes arrondies, normales lisses : à préférer à `BoxGeometry` pour tout objet vu de près).
- Post-traitement `three` (facultatif) : `post({ ao, dof, motion, accum, lens, bloom })` dans `setup` active une chaîne écrite en Three.js de base (les addons ne se chargent pas dans l'iframe) : rendu multiéchantillonné en HDR avec profondeur, occlusion ambiante, profondeur de champ, puis tone mapping. Les réglages restent modifiables à chaque image dans `s.fx` (ex. `s.fx.dof.focus = camera.position.distanceTo(cible)` pour une mise au point qui suit la caméra ; `s.fx.enabled = false` le coupe).
  - `ao` : `radius` (unités monde, défaut 0,5), `intensity` (1,2), `bias` (0,03), `ground` (0-1, assombrissement d'un sol `ShadowMaterial` transparent, 1), `enabled`.
  - `dof` : `focus` (distance nette, unités monde), `aperture` (flou en pixels de composition d'un objet à l'infini ; 0 = pas de flou, défaut), `maxBlur` (plafond en pixels, 16).
  - `motion` : flou de mouvement réel. L'obturateur reste ouvert `shutter` d'une image (0,5 = 180°, défaut), centré sur l'instant, et `samples` sous-images sont rendues (le `render` du script compris, à des temps décalés) puis moyennées avant le tone mapping. `samples` vaut 1 par défaut (pas de flou) et peut être une fonction du temps de composition, pour en mettre beaucoup sur les fouettés seulement (ex. `(t) => (t > 10.9 && t < 11.6 ? 48 : 8)`). Le flou ne s'applique qu'aux images fixes (pause, export, vignettes) : la lecture reste fluide. Il remplace le flou en images clés sur les fouettés de caméra.
  - `lens` : `ca` (aberration chromatique radiale, en pixels de composition aux coins ; 0 par défaut, 1 à 1,5 suffit).
  - `bloom` : halo des parties très lumineuses, ajouté en lumière linéaire avant le tone mapping. `strength` (0 = coupé, défaut ; 0,4 à 0,7), `threshold` (luminance HDR à partir de laquelle ça brille, 1 ; monter vers 2 et pousser `emissiveIntensity` des objets voulus à 3-5 pour que seuls eux brillent), `knee` (douceur du seuil, 0,5), `radius` (étalement, 1). À doser : les émissifs seulement, jamais les surfaces éclairées ni les écrans.
  - `accum` : accumulation de sous-images, comme `motion` sur les images fixes seulement (pause, export, vignettes). `samples` (1 = coupé, défaut ; nombre ou fonction du temps de composition, 16 à 64 pour un export propre) sous-images sont rendues et moyennées avant le tone mapping, chacune avec un décalage. `aa` (décalage sous-pixel de la caméra, en pixels, 1 par défaut : anticrénelage), `aperture` (rayon de l'objectif en unités monde, 0 par défaut : la caméra parcourt le disque de l'objectif en visant le plan net, ce qui donne un vrai bokeh ; mettre alors `dof.aperture` à 0), `focus` (distance nette, `dof.focus` si absent). Le nombre de sous-images d'une image est le plus grand de `motion.samples` et `accum.samples`. Le script lit `s.sub` (`i`, `n`, `u`, `v` point du disque unité, `jx`, `jy` entre -0,5 et 0,5 ; `n` vaut 1 hors accumulation) pour déplacer ses lumières à chaque sous-image : une lampe qui parcourt un petit disque donne une ombre à pénombre réelle. Le coût est multiplié par `samples` : le réserver à l'export.
  - Le fond reste transparent.

### Calque `three-gpu` (WebGPU, three r187, TSL)

Second type de calque 3D, à côté de `three` qui reste en WebGL r170 pour les motions existants (`ShaderMaterial` et `onBeforeCompile` n'existent pas sous WebGPU). Le script a la même forme et les mêmes outils `s.*` ; ce qui change :

- `THREE` est le build `three/webgpu` r187 : matériaux à nœuds (`MeshStandardNodeMaterial`, `MeshPhysicalNodeMaterial`, `SpriteNodeMaterial`…, avec `colorNode`, `positionNode`, `emissiveNode`, `opacityNode`…), `RenderPipeline`, `StorageInstancedBufferAttribute`. `TSL` : toutes les fonctions de `three/tsl` (`Fn`, `uniform`, `instancedArray`, `instanceIndex`, `hash`, `mix`, `pass`, `mrt`…). `addons` : `ao` (GTAO), `bloom`, `dof`, `traa`, `ssr`, `smaa`, `fxaa`, `denoise`, `chromaticAberration`, `RoomEnvironment`, `RoundedBoxGeometry`. Tout vient de `web/vendor/three-gpu.min.js`, un seul module construit par `tools/vendor-three-gpu.sh`.
- `renderer` : `WebGPURenderer` déjà initialisé (`await renderer.init()` fait avant `setup`), ACES, sRGB, fond transparent. `webgpu` : `true` sous WebGPU, `false` sur le moteur WebGL 2 de repli (le compute y est plus limité). `renderer.compute(noeud)` dans `render` lance un compute shader, de façon synchrone.
- En TSL, `time` vaut `s.t` et `deltaTime` une image (le runtime fixe l'horloge des nœuds à chaque image et sous-image) : un shader qui lit `time` reste déterministe.
- Le compute doit aussi dépendre du temps seulement : recalculer l'état à partir de `s.t` (positions d'orbite, bruit), pas l'intégrer d'une image à l'autre, car la timeline saute et revient en arrière.
- `post({ ao, dof, motion, lens, bloom })` : mêmes réglages et même `s.fx` que `three`, construits avec les addons TSL. Différences :
  - `ao` : GTAO débruité (normales reconstruites depuis la profondeur), `radius` (0,5), `intensity` (exposant, 1,2), `thickness` (1), `samples` (16), `ground` (1).
  - `bloom` : sur le tampon émissif seulement par défaut (`source: 'emissive'` ; `'scene'` pour toute l'image) : seuls les `emissive`, `emissiveIntensity` et `emissiveNode` brillent. `strength` (0 = coupé), `radius` (0,5), `threshold` (0).
  - `dof` : `enabled` (faux par défaut), `focus` (distance nette), `range` (distance au plan net où le flou est complet), `bokeh` (1), en unités monde.
  - `motion`, `accum` (et `s.sub`) et `lens` : comme `three`.
- `output` : un nœud TSL qui remplace la chaîne de `post` (TRAA, SSR, composite à soi), à assigner dans `setup`. Le flou de mouvement et le tone mapping s'appliquent toujours. Les effets temporels (TRAA) accumulent l'historique des images précédentes : propres à l'export, qui rend dans l'ordre, moins sur une image isolée.

```js
function setup(s) {
  const { THREE, TSL: N, scene } = s;
  const COUNT = 200000, pos = N.instancedArray(COUNT, 'vec3');
  s.uT = N.uniform(0);
  s.place = N.Fn(() => {
    const i = N.instanceIndex, r = N.hash(i).mul(4).add(1), a = N.hash(i.add(9)).mul(N.TWO_PI).add(s.uT.div(r));
    pos.element(i).assign(N.vec3(N.cos(a).mul(r), N.hash(i.add(3)).sub(0.5).mul(0.3), N.sin(a).mul(r)));
  })().compute(COUNT);
  const mat = new THREE.SpriteNodeMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  mat.positionNode = pos.toAttribute();
  mat.colorNode = mat.emissiveNode = N.color('#5ee1d6').mul(0.03); // l'émissif nourrit le bloom
  mat.opacityNode = N.smoothstep(0.5, 0.1, N.uv().distance(N.vec2(0.5)));
  mat.scaleNode = N.float(0.03);
  const sprites = new THREE.Sprite(mat);
  Object.assign(sprites, { count: COUNT, frustumCulled: false });
  scene.add(sprites);
  s.camera.position.set(0, 5, 9);
  s.camera.lookAt(0, 0, 0);
  s.post({ bloom: { strength: 0.8 } });
}

function render(s) {
  s.uT.value = s.t;
  s.renderer.compute(s.place);
}
```

Modèle complet : « Nébuleuse · WebGPU » (262 144 particules, socle en argile, GTAO, bloom de l'émissif, flou de mouvement).

### Exemple `three`

```js
function setup(s) {
  const { THREE, scene } = s;
  s.env();
  s.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0.05, thickness: 1.2 }));
  scene.add(s.mesh);
}

function render(s) {
  const k = s.range(s.t, 0, 2, s.ease.outExpo);
  s.mesh.rotation.set(s.t * 0.3, s.t * 0.5 + k * 2, 0);
  s.camera.position.z = s.lerp(14, 9, k);
}
```

Les erreurs s'affichent dans l'inspecteur avec le numéro de ligne, et le calque est marqué en rouge dans la timeline.

## Repères de style

- Les modèles intégrés (`web/studio/templates.js`) servent d'exemples complets : ident 3D en verre, typo cinétique verticale, galaxie de particules en Canvas 2D, paysage de barres instanciées, nébuleuse de particules en compute WebGPU.
- Combiner script et images clés : la scène 3D dans le script, sa place et son échelle dans l'image en images clés sur le calque (`y`, `scale`), ce qui reste ajustable dans la timeline.
- Fondu de sortie sur les derniers 0,5 s pour que la boucle et l'export finissent proprement.
