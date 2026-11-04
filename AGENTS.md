# AGENTS.md

缁欏湪杩欎釜浠撳簱閲屽共娲荤殑 agent锛堝拰浠ュ悗鐨勮嚜宸憋級鐪嬬殑銆傜敤鎴峰悜鐨勮鏄庡湪 [README](./README.md)銆?
## 杩欐槸浠€涔?
DeepSeek Harness锛圖SH锛夋彃浠讹細璇嗗埆宸ヤ綔鍖洪噷鐨?Minecraft 妯＄粍宸ョ▼锛屽苟鍦ㄤ細璇濇爣棰樻爮鎻愪緵涓€涓?IDEA 椋庢牸鐨勮繍琛屾帶浠讹紙閫変腑鐩爣 鈫?鍚姩 / 鍋滄 / 鐪嬫棩蹇楋級銆?
鐣岄潰涓嶆槸鍏ㄩ儴銆傞潰鏉夸笌宸ュ叿鍏辩敤鍚屼竴浠借繍琛岀姸鎬佷笌鍚屼竴鎶婇攣锛?*浜?*鐪嬪伐绋嬬姸鎬併€佽捣鍋溿€佽鏃ュ織锛?**妯″瀷**璇嗗埆宸ョ▼銆佸惎鍔ㄤ换鍔°€佹嬁鏃ュ織銆佹嬁缁撹銆傚悓涓€宸ョ▼鍚屾椂鍙湁涓€涓疄渚嬶紝涓よ竟涓嶄細浜掔浉韪┿€?涓よ€呯殑鍒嗗伐鏉ヨ嚜杩愯鐩爣鐨勪袱绫荤敓鍛藉懆鏈燂細

- `daemon`锛坄runClient` / `runServer`锛夛細涓€鐩磋窇鍒颁汉鍏崇獥鍙ｏ紝"灏辩华"鏄釜鏈夋剰涔夌殑鐘舵€侊紱
- `oneshot`锛坄runData` / `runGameTestServer` / 鑷缓 `runGametest`锛夛細璺戝畬鍗崇粨鏉燂紝
  缁撴潫鏃剁殑 `verdict` 鎵嶆槸瀹冪殑浜у嚭銆傛ā鍨嬬殑"鏀?鈫?璺?鈫?楠?闂幆闈犺繖涓€绫汇€?
绐楀彛鐢婚潰鏄ā鍨嬪垽鏂笉浜嗙殑閮ㄥ垎锛屼氦缁欎汉锛涜兘鏂█鐨勶紙鏋勫缓銆佹暟鎹敓鎴愩€乬ametest 缁撴灉锛変氦缁欐ā鍨嬨€?
- 瀹夸富渚э細ESM銆佹棤 TypeScript銆丣SDoc 娉ㄨВ锛汵ode 鈮?20銆?- 瀹㈡埛绔晶锛歊eact 缁勪欢鐢?`h()` 鎵嬪啓锛堜笉鐢?JSX锛夛紝鐢?esbuild 鎵撴垚 CJS锛屽啀鍖呬竴灞?  `window.__ModuleLoader__.load({ id, factory })`銆?- 璁捐鏂囨。锛歔绛栧垝](./doc/绛栧垝.md)锛堟灦鏋勩€佽鍒欍€侀噷绋嬬锛夈€乕DSH 鎻掍欢鏈哄埗璋冪爺](./doc/璋冪爺-DSH鎻掍欢鏈哄埗.md)銆?
## 鐩綍

```
src/index.js          瀹夸富鍏ュ彛锛歩nject + apply锛屾寕 HTTP 璺敱涓庡伐鍏?src/tools.js          鍏釜妯″瀷宸ュ叿锛坢c_projects / mc_project_detail / mc_launch / mc_launch_logs / mc_launch_list / mc_launch_stop锛?src/lib/
  api.js              /mcdev/api 鐨勬柟娉曞疄鐜帮紙scan / detail / state / launch.*锛?  detect.js           宸ョ▼鐢诲儚锛歭oader銆佹ā鍧椼€乺un 鐩爣銆佽瘉鎹笌璀﹀憡
  scanner.js          宸ヤ綔鍖?BFS锛堟繁搴?3銆佸壀鏋濄€佷笂闄愶級
  gradle.js           build.gradle / settings.gradle / gradle.properties 鐨勮В鏋?  metadata.js         mods.toml / fabric.mod.json / plugin.yml / archive.yml
  java.js             JDK 鎺㈡祴涓庣増鏈尮閰嶏紙璇?<jdk>/release锛屼笉璧疯繘绋嬶級
  deps.js             澹版槑渚濊禆锛歞ependencies 鍧椼€乴ibs.versions.toml銆佸厓鏁版嵁 depends
  jdks.js             姣忎釜宸ョ▼鐨?JDK 閫夋嫨锛堜紭鍏堢骇銆乯dk.json 鎸佷箙鍖栥€佽涓嶈娉ㄥ叆锛?  verify.js           鐩爣鍒嗙被锛坉aemon / oneshot锛変笌涓€娆℃€т换鍔＄殑瑁佸喅锛坴erdict锛?  launches.js         鍚姩鏈嶅姟锛歴pawn銆佸氨缁垽瀹氥€佹棩蹇楃幆褰㈢紦鍐层€佸仠姝€佺姸鎬佸璐?  state.js            ~/.dsh/mc-dev-starter 涓嬬殑鐘舵€佷笌鏃ュ織锛堣繍琛岃褰曟寜 profile 鍒嗙洰褰曪級
  argv.js             gradlew 鍛戒护琛屾瀯閫狅紙鍚?Windows 寮曞彿瑙勫垯锛?  idea.js             IntelliJ `.idea` 宸ョ▼妯″瀷锛堟ā鍧楁竻鍗?/ facet / 宸ョ▼ JDK / 杩愯閰嶇疆锛?  xml.js              鏋佺畝 XML 瑙ｆ瀽锛堥浂渚濊禆锛屽彧鏈嶅姟 .idea锛?  text.js / toml.js   灏忓伐鍏?src/client/
  index.js            瀹㈡埛绔叆鍙ｏ細鑳跺泭 slot銆佷袱涓爣绛剧被鍨嬨€乥etter-sidebar 鍙€夋敞鍐?  Capsule.js          鏍囬鏍忚兌鍥婏紙鐘舵€佺偣 + 鐩爣鍚?+ 鍚仠锛?  Flyout.js           娴眰锛堝崟宸ョ▼鐗瑰寲 / 澶氬伐绋嬩笁娈电粨鏋勶級
  DetailTab.js        宸ョ▼闈㈡澘锛堢増鏈€佺幆澧冦€佹ā鍧椼€佽瘉鎹€佽鍛婏級
  LogTab.js           鏃ュ織鏍囩锛堝巻鍙层€佽窡闅忋€佸綊鍥狅級
  state.js / selection.js / format.js / icons.js / styles.js / runtime.js
lib/client.js         鏋勫缓浜х墿锛?gitignore 蹇界暐锛涢潬 package.json 鐨?files 鎵撹繘 npm 鍖咃紝杩愯鏃剁洿鎺ュ姞杞斤級
test/                 155 涓祴璇?+ fixtures锛堢湡瀹炲伐绋嬪舰鎬佺殑鍋囦粨搴擄紱fixtures-multi 鏄妯″潡鑱氬悎宸ョ▼锛?doc/                  绛栧垝涓庤皟鐮?```

## 鍛戒护

```powershell
node --test                       # 鍏ㄩ儴娴嬭瘯锛堥粯璁ゅ彂鐜?test/*.test.js锛汵ode 20 涓嶈 glob锛屽埆鍐?"test/*.test.js"锛?npm test                          # 鍚屼笂锛屽厛閲嶅缓瀹㈡埛绔啀璺?node scripts/build-client.mjs     # 鏋勫缓瀹㈡埛绔紙鏀?src/client 鍚庡繀椤昏窇锛?node scripts/build-client.mjs --watch
node scripts/check-pack.mjs       # 鍙戝竷鍓嶆牎楠?npm 鍖呭唴瀹癸紙缂?lib/client.js銆佸甯?test/ 閮戒細澶辫触锛?node scripts/scan-catalog.mjs     # 鎵湡瀹炲伐绋嬶紝杈撳嚭璇嗗埆缁撴灉琛?```

CI 鍦?`.github/workflows/ci.yml`锛歶buntu / windows / macOS 脳 Node 20/22/24 璺戞瀯寤轰笌娴嬭瘯锛?鍙︽湁涓€涓?pack 浠诲姟璺?`check:pack`銆俙prepack` 浼氬湪鎵撳寘鍓嶈嚜鍔ㄦ瀯寤猴紝瀹㈡埛绔紡鏋勫缓鍙戜笉鍑哄幓锛?`test/bundle.test.js` 鎸夊涓诲姞杞藉崗璁湡璺戜竴閬嶄骇鐗╋紝瀹㈡埛绔寕鎺変笉鐢ㄧ瓑鐢ㄦ埛瑁呭畬鎵嶅彂鐜般€?
鏀瑰畬瀹㈡埛绔?*蹇呴』**閲嶆柊鏋勫缓 `lib/client.js` 骞惰窇娴嬭瘯锛涙牱寮忔敼鍔ㄨ繕瑕佽繃 `test/styles.test.js`
锛堥鑹?瀛楀彿蹇呴』寮曠敤 `--dsw-*` 浠ょ墝锛屼笉璁稿啓瀛楅潰鑹插€硷級銆?
## 寮€鍙戞湡瀹夎

```powershell
node <npm>/@deepseek-ai/dsh/lib/bin.js plugin --profile m0test add link:C:/Projects/minecraft-dev-starter
node <npm>/@deepseek-ai/dsh/lib/bin.js --profile m0test --port 3499 --no-open
```

`link:` 鎵嶈兘鏀瑰畬鍗崇敓鏁堬紱`file:` 浼氳 pnpm 鎷疯礉鎴愬壇鏈紝缂栬緫浠撳簱涓嶅奖鍝嶅凡瑁呭壇鏈€?
## 纭潙锛堥兘韪╄繃锛屽埆鍐嶈俯锛?
| 鐜拌薄 | 鍘熷洜 | 鍋氭硶 |
|---|---|---|
| 瀹㈡埛绔暣鍖呬笉鍔犺浇 | 娌℃湁 `__ModuleLoader__.load` 鍖呰銆佹垨 factory 閲岀敤浜?ESM | esbuild 鎵?CJS锛宐anner/footer 鐢?`scripts/build-client.mjs` 鐢熸垚 |
| `ctx.get('x')` 鎷垮埌 undefined | cordis 瑕佹眰鏈嶅姟鍏堝０鏄庡湪 `inject` | 闇€瑕佷粈涔堝啓杩?`inject`锛涘彲閫夋湇鍔＄敤 `ctx.inject([...], cb)` 鎴?`ctx.get(name, false)` |
| 娉ㄥ唽 slot 鎶?"not declared" | 鐖舵潯鐩繕娌″０鏄庤 slot | 鐢?`ctx.slots.inject(name, 鈥?`锛屾垨娉ㄥ唽澶辫触鍚庨噸璇?|
| 鍚姩鍚庢棩蹇?0 瀛楄妭 | Windows 涓?`detached: true` 璁╁瓙杩涚▼涓㈡帀鎴戜滑鐨勭閬擄紙`DETACHED_PROCESS` 涓?`CREATE_NO_WINDOW` 鍐茬獊锛?| Windows 鍏抽棴 detached锛屼繚鐣?`windowsHide`锛汸OSIX 鎵?detached锛堣杩涚▼缁勶級 |
| 鍚姩鏃跺涓€涓帶鍒跺彴绐楀彛 | 鍚屼笂锛氭病鏈夊彲缁ф壙鐨勯殣钘忔帶鍒跺彴锛宩ava 鑷繁寮€涓€涓?| 鍚屼笂锛屽叧闂?detached 鍚庢秷澶?|
| 涓枃鏃ュ織涔辩爜 | `.bat` 杈撳嚭鎸?GBK 缂栫爜 | `decodeLine`锛氬厛鎸?UTF-8 瑙ｏ紝澶辫触鍐嶆寜 GBK |
| 宸ュ叿鎶?"value is not lossless JSON" | 杩斿洖鍊奸噷甯︿簡 `undefined` | 鍙斁瀛樺湪鐨勫瓧娈碉紱娴嬭瘯閲岀敤 `assertLossless()` |
| 鏀?profile 鍚庡惎鍔ㄥけ璐?| `package.json` 鍐欏叆浜?BOM | 鐢ㄦ棤 BOM 鐨?UTF-8 鍐欙紱鏀瑰畬蹇呴』閲嶅惎 DSH |
| 浠撳簱鐨?`node_modules` 绁炵娑堝け | 鍦ㄦ煇涓?profile 閲屾妸 `link:` 渚濊禆鎹㈡垚 `file:`/npm 鍖呮椂锛宲npm 瑙ｉ摼浼?*鍒犳帀琚摼鎺ョ洰褰曠殑 `node_modules`**锛堝疄娴嬶細`plugin add link:` 鈫?鍦?鈫?`plugin add file:tgz` 鈫?娌′簡锛?| 鍒湪鍚屼竴 profile 閲屾潵鍥炲垏鎹㈠畨瑁呮柟寮忥紱tarball/registry 楠岃瘉鐢ㄧ嫭绔?profile锛涘彂鐜版秷澶卞氨 `npm install --ignore-scripts` 閲嶈 |
| 渚ф爮鏍囩鎵撲笉寮€ | `openTab` 鐨勫睍寮€鏄紓姝ョ殑 | 鎵撳紑鍚庣瓑涓€甯у啀鏂█ `isExpanded()` |
| 鍙戠増鍚庤涓嶅埌鏂扮増鏈?| pnpm 缂撳瓨浜?registry 鍏冩暟鎹紙`%LOCALAPPDATA%\pnpm-cache\metadata-v1.3\registry.npmjs.org\<pkg>.json`锛夛紝`dsh plugin add` 浼氭姤 "latest is 0.1.2"銆佺敋鑷?鍙湁 4 涓増鏈? | 鍒犳帀閭ｄ釜 `<pkg>.json` 鍐嶈锛涘悓鏃剁‘璁?`.npmrc` 閲岀殑浠ｇ悊鏄€氱殑 |
| 涓€娆℃€т换鍔¤褰撴垚瀹堟姢杩涚▼ | 鐢?绛夊氨缁?鐨勮涔夌 `runData` / `runGameTestServer`锛歚BUILD SUCCESSFUL` 鏄?*缁堟**淇″彿鍗磋褰撴垚**灏辩华**淇″彿锛岃€屼笖璺戝畬鎷夸笉鍒?杩囨病杩? | 鐩爣甯?`mode`锛坉aemon / oneshot锛夛紝oneshot 鐢熶笅鏉ュ氨鏄?running銆佺粨鏉熷嵆绠?`verdict`锛涜 `src/lib/verify.js` |
| `runs { configureEach { } }` 鍙樻垚鍋囩洰鏍?| `runs` 鏄?NamedDomainObjectContainer锛屽鍣?API 鐨勫潡涔熻褰撴垚 run 閰嶇疆锛屼骇鍑?`runConfigureEach`锛堝惎鍔ㄦ姤 Task not found锛?| 瀹瑰櫒 API 鍚嶅崟 + 鍙敹椤跺眰鍧?+ 璁?`create("name")`锛涜 `parseRuns` |
| 娴嬭瘯鎸備簡鍗村垽閫氳繃 | 閮ㄥ垎 GameTest 杩愯鍣ㄥけ璐ユ椂杩涚▼浠嶉€€ 0 | 瑁佸喅鍏堢湅澶辫触鐗瑰緛琛屻€佸啀鐪嬮€€鍑虹爜锛沗readVerdict` 閲岄『搴忎笉鑳借皟 |
| `libs.versions.toml` 瑙ｆ瀽鎴愪竴鏁存潯瀛楃涓?| `parseToml` 涓嶆敮鎸佸唴鑱旇〃锛宍{ module = "a:b", version = "1" }` 鍘熸牱杩斿洖 | 宸茶ˉ `parseInlineTable`锛涘洖褰掕 `test/toml.test.js` 涓?`test/deps.test.js` |
| 璇?`.idea` 鏃舵姏 `Cannot read properties of undefined` | 鍙湁 `modules.xml`銆佹病鏈?`misc.xml` 鐨勫伐绋嬶細`componentOf(undefined)` 鐩存帴鍙?`.name` | `rootOf` / `componentOf` 瀹瑰繊 undefined锛涘洖褰掕 `test/idea.test.js` |
| worktree 閲岀殑 `node_modules` 涓€鍒狅紝涓讳粨搴撶殑涔熸病浜?| 鐢?junction 鎸囧悜涓讳粨搴撶殑 `node_modules`锛宍git worktree remove` 閫掑綊鍒犻櫎鏃朵細璺熺潃鐩爣璧?| 鍒湪 worktree 閲?junction 涓讳粨搴撲緷璧栵紱瑕佽窇娴嬭瘯灏卞鍒舵垨鐢ㄧ嫭绔?`npm ci`锛屽垹涔嬪墠鍏堢‘璁ら摼鎺ョ被鍨?|
| 鏈湴鍏ㄧ豢銆丆I 鍏ㄧ孩 | 娴嬭瘯澶瑰叿锛坄.idea`銆佸浘鐗囩瓑锛夎 `.gitignore` 蹇界暐锛氭湰鍦版湁鏂囦欢锛屽共鍑€ checkout 娌℃湁 | 澶瑰叿鐩綍瑕佸湪 `.gitignore` 閲屾樉寮忔斁琛岋紱鍙戠増鍓嶇敤 `git clone` 鍒颁复鏃剁洰褰曡窇涓€閬?|

鍏朵粬绾﹀畾锛?
- 鐢ㄦ埛鑳界湅鍒扮殑姣忎釜缁撹閮藉繀椤诲甫璇佹嵁锛坙oader 浠庡摢涓彃浠舵潵銆佺洰鏍囦粠鍝釜 run 鍧楁潵锛夛紱
  `unknown` 鏄悎娉曠瓟妗堬紝涓嶈鐚滄垚纭畾鍊笺€?- 鎺ㄦ祴鍑烘潵鐨勭洰鏍囪鏍?`guessed: true`锛孶I 鏄剧ず銆屾湭楠岃瘉銆嶏紝涓嶈闅愯棌銆?- 璇佹嵁婧愭湁涓绘锛?*鏋勫缓鑴氭湰鏄富銆乣.idea` 鏄緟**銆俙.idea` 鍙ˉ缂猴紙妯″潡娓呭崟銆乫acet 骞冲彴銆佸伐绋?JDK銆?  杩愯閰嶇疆锛夛紝缁濅笉鎺ㄧ炕鏋勫缓鑴氭湰宸茬粡鍒ゅ畾鐨?loader 涓庣洰鏍囷紱琛ュ嚭鏉ョ殑鐩爣鏍?`source: 'idea-run-config'`锛?  涓嶆槸 `guessed`鈥斺€斿畠鍦?IDE 閲岀湡鐨勮璺戣繃銆?- 澶氭ā鍧楀伐绋嬮噷瀛愭ā鍧楀悇鑷垚宸ョ▼锛屼换鍔¤矾寰勫繀椤诲甫 Gradle 妯″潡鍓嶇紑銆佸湪鑱氬悎鏍规墽琛岋紱
  銆屽湪鍝釜鐩綍璺?gradlew銆嶈繖浠朵簨鐢辫瘑鍒粨鏋滃喅瀹氾紝涓嶅厑璁歌皟鐢ㄦ柟鎸囧畾銆?- 涓嶅仛闅愬惈鐨?`clean`锛涙瀯寤虹洰褰曚笉纰般€?- 涓€涓伐绋嬪悓鏃跺彧鍏佽涓€涓疄渚嬶紱璺ㄥ伐绋嬪彲浠ュ苟琛屻€?- 鐘舵€佹枃浠惰鍐欒 tmp + rename锛岃繘绋嬫帰娲诲け璐ヨ `unknown`锛屼笉浼€犵粨鏉熷師鍥犮€?
## 楠岃瘉璁板綍

鍘嗗彶閲岀▼纰戠殑楠岃瘉缁撹銆傚師濮嬮暱鏂囧凡骞跺叆杩欓噷锛宍doc/` 鍙繚鐣欒璁′笌璋冪爺銆?
### M0 鍔犺浇鍗忚涓庢Ы浣嶏紙2026-10-30锛岄€氳繃锛?
瀹㈡埛绔寘鑳藉湪鐪熷疄杩愯鏃堕噷鍔犺浇銆佹縺娲汇€佹敞鍐屾爣棰樻爮 slot 涓庡彸渚ф爮鏍囩锛屽苟鑳介┍鍔?`openTab` 灞曞紑渚ф爮銆?浜у嚭鍥涗釜鍚庣画涓€鐩存部鐢ㄧ殑缁撹锛歜undle 蹇呴』 `__ModuleLoader__.load` 鍖呰锛汣SS 浠?`<style>` 娉ㄥ叆锛?鏈嶅姟瑕佸厛澹版槑 `inject`锛沗openTab` 灞曞紑鏄紓姝ョ殑銆?
### M1 璇嗗埆寮曟搸锛?026-10-31锛岄€氳繃锛?
22 涓湡瀹炲伐绋嬭窇閫氾紝璇嗗埆 loader / Minecraft 鐗堟湰 / 妯″潡 / run 鐩爣锛沞sbuild 鏋勫缓閾句笌闈㈡澘鎺ラ€氥€?涓ゅ淇锛歚net.neoforged.moddev.legacyforge` 浜у嚭鐨勬槸 **Forge** 1.20.1 妯＄粍锛堟浘璇垽鎴?NeoForge锛夛紱
鑱氬悎浠撳簱鐨?loader 鍙啓鍦ㄥ瓙妯″潡閲岋紝鍥犳鍔犱簡妯″潡绾ф彃浠跺洖閫€涓?`loaders[]`锛涙帹娴嬬洰鏍囨寜"姣忎釜鍏蜂綋骞冲彴涓€涓?Client"鏀舵暃锛岄伩鍏嶄竴涓伐绋嬪埛鍑哄崄鍑犱釜鐩爣銆?
### M2 鎵樼鍚姩锛?026-10-31锛岄€氳繃锛?
璇嗗埆鍑虹殑鐩爣鍙互鐪熺殑鍚姩銆佽繘鍏ヨ繍琛屾€併€佽鏃ュ織銆佸仠姝紝涓斾笉鐣欏鍎胯繘绋嬨€傚叧閿喅绛栵細瀹夸富涓嶆墭绠″瓙杩涚▼鍙ユ焺锛?鐢?`taskkill /PID <pid> /T /F` 鏉€鏁存５鏍戯紱灏辩华鐢ㄦ棩蹇楁爣璁帮紙client锛歀WJGL/OpenAL/`[Render thread/INFO]`锛?server锛歚Done (鈥)!`锛夛紱鐘舵€佽惤鐩樺苟鍋氶噸鍚悗瀵硅处銆傞『甯︿慨浜?GBK 瑙ｇ爜銆?
### M3 鑳跺泭涓庢诞灞傦紙2026-10-31锛岄€氳繃锛?
鏍囬鏍忚兌鍥婃垚涓哄敮涓€鍏ュ彛锛氱洰鏍囧悕銆佺姸鎬佺偣銆佸惎鍋滐紱娴眰鏀舵暃鎴愬崟閫夊苟璁颁綇姣忎釜宸ョ▼鐨勯€夋嫨锛?姣忎釜宸ョ▼浜掓枼銆佽法宸ョ▼鍙苟琛岋紱鏃х殑 `DEV_AUTO_OPEN` 寮€鍏充笅绾裤€?
### M4 鏃ュ織鏍囩锛?026-10-31锛岄€氳繃锛?
鏃ュ織鎴愪负鐙珛鏍囩锛氭寜宸ョ▼鍒楀巻鍙层€侀粯璁ゆ渶鏂般€佸彲璺熼殢銆佸穿婧冩椂缁欏綊鍥狅紱鍚姩鍚庤嚜鍔ㄦ墦寮€锛屽彲鐢?`autoOpenLogTab` 鍏虫帀銆傜‘璁ゆ彃浠?*涓嶉渶瑕?*瀵煎嚭 schemastery 鐨?`Config`鈥斺€攑atch 琛岀殑 `config`
浼氬師鏍蜂紶缁?`apply(ctx, config)`銆?
### M5 AI 宸ュ叿锛?026-10-31锛岄€氳繃锛?
鍥涗釜宸ュ叿涓庨潰鏉垮叡鐢ㄥ悓涓€濂楁湇鍔★細`mc_projects` / `mc_launch` / `mc_launch_logs` / `mc_launch_stop`銆?渚濊禆 `@deepseek-ai/dsh-tools@0.2.1-rc.3`锛堜笌妗岄潰杩愯鏃跺榻愶級銆?
### M7 UI 鎵撶（锛?026-10-31锛屽畬鎴愶級

鎵嬬粯 16px 鍥炬爣锛堥伩鍏嶉《灞?require 绗笁鏂瑰寘锛夈€侀鏋剁┖鎬併€佸姩鏁堝苟灏婇噸 `prefers-reduced-motion`銆?鏂囨鍘诲唴閮ㄦ湳璇紙"鎺ㄦ祴"鈫?鏈獙璇?锛夈€傛牱寮忔姢鏍忔祴璇曚粠姝ゆ椂寮€濮嬨€?
### M8 鐪熸満楠岃瘉锛坉esktop profile锛?026-10-31锛?
鎸傝浇鏂瑰紡锛歚dependencies` 鍔?`link:` + `dsh.profile.bundles` 杩藉姞锛屾闈㈣嚜甯?pnpm 瀹夎銆?棣栨鎸傝浇鍚庡惎鍔?EnchatingPaper Client 鎴愬姛锛屽叧闂悗鐘舵€佸悓姝ワ紝鍥涗釜宸ュ叿鍦ㄧ湡瀹炶繍琛屾椂娉ㄥ唽鎴愬姛銆?
涓変釜闂锛?
1. **鏃ュ織 0 瀛楄妭**锛歚detached: true` 鍦?Windows 涓婁涪绠￠亾锛堝悓涓€鍛戒护 detached 0 瀛楄妭 / attached 564 瀛楄妭锛夈€?2. **澶氫竴涓帶鍒跺彴绐楀彛**锛氬悓婧愶紝鍏抽棴 detached 鍚庢秷澶憋紙宸茬敱鐢ㄦ埛纭锛夈€?3. **`mc_projects` 鎶?0 涓洰鏍?*锛氭覆鏌撹 `runTargets`锛岃€岃緭鍑哄€奸噷瀛楁鍙?`targets`銆?
绗簩杞細

4. **鏃ュ織鏍囩涓嶈窡鏂板疄渚?*锛氭棫閫昏緫鍙湪娌￠€夎繃鏃舵寫涓€娆?鈫?`pickLogTarget()`锛堟湁瀹炰緥鍦ㄨ窇灏辫窡瀹冿級銆?5. **宸ュ叿杈撳嚭 "not lossless JSON"**锛氳繑鍥炲€煎惈 `undefined` 瀛楁锛屾敞鍐屽櫒鏁存潯鎷掔粷銆?
绗笁杞細**鍒囦細璇濅笉鍚屾**鈥斺€斿涓荤敤"鏈€杩戝垱寤虹殑浼氳瘽"褰撳伐浣滃尯锛屼笖鑳跺泭鍙湪鎸傝浇鏃舵壂涓€娆°€?鏀逛负鑳跺泭鎸?`sessionId` 璁㈤槄 `useSessions` 鐨?cwd锛宑wd 鍙樺寲鏃舵竻绌烘棫缁撴灉閲嶆壂锛涘惎鍔ㄦ牎楠屾斁瀹戒负
"钀藉湪浠讳竴娲昏穬浼氳瘽 cwd 涔嬪唴"锛涘伐鍏锋敼鐢ㄨ皟鐢ㄦ柟浼氳瘽鐨?cwd銆?
鏈€缁?59 涓祴璇曘€?
### M9 鐢熸€侀泦鎴愪笌鍗曞伐绋嬬壒鍖栵紙2026-10-31锛?
- 鍚?`dsh-better-sidebar` 娉ㄥ唽涓や釜甯﹀浘鏍囬〉闈紙`ctx.betterSidebar.registerTab`锛宍icon` 鏀寔
  `(size) => ReactNode`锛夈€傜敤 `ctx.inject(['betterSidebar'], 鈥?` 鍋氬彲閫変緷璧栵紝鏈畨瑁呭垯闈欓粯璺宠繃銆?- 鍘熺敓鍙充晶鏍忕殑 tab 绫诲瀷瀹氫箟**娌℃湁 icon 瀛楁**锛屼絾鍙互鐢ㄥ甫閿?seat `sidebar.right.pane.tab.title`
  鎺ョ鏍囬娓叉煋锛堝唴缃殑 schedule / plan 椤电灏辨槸杩欎箞鍔犲浘鏍囩殑锛夛紱0.1.10 璧蜂袱涓爣绛鹃兘璧拌繖鏉¤矾銆?- 闈㈡澘鏀瑰悕銆孧C 宸ョ▼銆嶁啋銆孧od Dev銆嶏紙鍔熻兘鍚嶏紝涓嶆槸鍚嶈瘝鎻忚堪锛夛紝娴眰琛ㄥご/鏍囩/璇︽儏椤电粺涓€銆?- 鍗曞伐绋嬪伐浣滃尯璺宠繃宸ョ▼鍒楄〃锛氳〃澶寸洿鎺ユ壙鎷呭伐绋嬭韩浠斤紙鍚嶅瓧 + loader/鐗堟湰 + 璺緞锛夈€?
### M10 楠岃瘉鍥炶矾锛?026-10-31锛?
鎶?杩愯鐩爣"鍒嗘垚涓ょ被鐢熷懡鍛ㄦ湡锛屽苟缁欎細璺戝畬鐨勯偅绫昏ˉ涓婄粨璁恒€傝捣鍥犳槸涓や釜鍒ゆ柇锛氭ā鍨嬫棤娉曚粠娓告垙绐楀彛閲?鑾峰緱淇℃伅锛堝畠鍙兘璇绘棩蹇楋級锛岃€屽畠鑷繁鐨勫懡浠ゆā鍨嬭涓嶄笅涓€涓暱鐢熷懡鍛ㄦ湡杩涚▼锛堣秴鏃躲€佸崟渚嬨€佹潃鏍戙€丣DK锛夈€?
- **璇嗗埆灞?*锛歚runTargets[].mode`鈥斺€擿client` / `server` 鈫?`daemon`锛沗data` / `datagen` /
  `gameTest` / `gameTestServer` 鈫?`oneshot`銆傝涓嶅嚭鐨?kind 涓€寰嬪綋 daemon锛屼笉鏇块檶鐢熶换鍔″甯?璺戝畬浜?銆?- **鐢熷懡鍛ㄦ湡**锛歰neshot 鐢熶笅鏉ュ氨鏄?`running`锛堟病鏈夊氨缁繖涓€姝ワ級锛屼笉鎵?`readyTimedOut`锛?  杩涚▼缁撴潫鍗?`exited`锛屽悓涓€娆¤惤鐩樺啓鍏?`verdict` / `summary` / `failures`銆?- **瑁佸喅**锛歚readVerdict` 鐨勯『搴忔槸"琚仠 鈫?璧蜂笉鏉?鈫?澶辫触鐗瑰緛琛?鈫?闈為浂閫€鍑虹爜 鈫?鎴愬姛鐗瑰緛琛?鈫?闆堕€€鍑虹爜 鈫?unknown"銆?  澶辫触鐗瑰緛鎺掑湪閫€鍑虹爜涔嬪墠锛屾槸涓轰簡鎶撲綇"娴嬭瘯鎸備簡浣嗚繘绋嬮€€浜?0"锛堥儴鍒?GameTest 杩愯鍣ㄥ姝わ級銆?- **宸ュ叿**锛歚mc_launch` 鐨勯粯璁?`wait` 鐢?mode 鍐冲畾锛坉aemon 鈫?ready锛宱neshot 鈫?exit锛夛紱
  鏄惧紡浼?`ready` 缁?oneshot 鏃舵寜 exit 澶勭悊骞堕檮 `note`锛涜緭鍑烘柊澧?`mode` / `verdict` / `summary` / `failures`銆?  `mc_project_detail`锛堟瘡涓洰鏍囨爣甯搁┗/浼氳窇瀹岋級銆乣mc_launch_list`锛堝巻鍙插甫缁撹锛夈€乣mc_launch_logs`锛堢粨璁烘憳瑕侊級鍚屾鏆撮湶銆?- **闈㈡澘**锛氱姸鎬佽瘝鍖哄垎涓恒€岃繍琛屼腑 / 鎵ц涓€嶃€岄€氳繃 / 澶辫触銆嶏紝鍏朵綑鏈姩銆?
楠岃瘉锛?
- 鐪熸満璇嗗埆锛欵nchatingPaper銆丳rotectionEngineering 鐨?`runData` / `runGameTestServer` 鍒や负 oneshot锛?  `runClient` / `runServer` 鍒や负 daemon銆?- 鐪熷疄鏃ュ織鍥炴斁锛氭嬁 `~/.dsh/mc-dev-starter/logs` 閲岀殑鐪熷疄 Gradle 杈撳嚭鍠?`readVerdict`鈥斺€?  鎴愬姛鏀跺熬锛坄BUILD SUCCESSFUL in 38s`锛夊垽 passed锛屼緷璧栬В鏋愬穿婧冨垽 failed 骞跺彇鍒?`BUILD FAILED`銆?- 97 涓祴璇曪紱`test/verify.test.js` 瑕嗙洊鍒嗙被涓庤鍐筹紝`test/launch.test.js` 鐢ㄧ湡瀛愯繘绋嬭窇閫?oneshot 鐨勪袱绉嶇粨灞€銆?
### M11 瑙ｆ瀽淇涓?JDK 閫夋嫨锛?026-11-01锛?
涓や欢"璇翠簡浣嗘病鍋氬埌"鐨勪簨鏀跺彛锛?
- **`runs` 瀹瑰櫒 API 涓嶅啀鍙樻垚鐩爣**锛歚runs { configureEach { 鈥?} }` 鏇句骇鍑?`runConfigureEach`銆?  鐜板湪鎸夊鍣?API 鍚嶅崟璺宠繃銆佸彧鏀?`runs` 浣撻噷鐨勯《灞傚潡锛坮un 閰嶇疆鍐呴儴鐨勫祵濂楀潡涓嶇畻锛夛紝
  骞舵敮鎸?`create("name")` / `register("name")` 杩欑被宸ュ巶鍐欐硶銆傜湡鏈洪獙璇侊細ProtectionEngineering
  浠?5 涓洰鏍囧洖鍒?4 涓€?- **JDK 鐪熸鍙備笌鍚姩**锛氫互鍓嶅彧璇嗗埆涓嶆敞鍏ワ紝闈㈡澘璇?閫変腑 21"鑰屽疄闄呰窇鐨勬槸鐜閲岀殑 java銆?  鐜板湪 `jdk.json` 璁版瘡涓伐绋嬬殑鎸囧畾锛堟墜鍔?> `gradle.properties` > 鑷姩锛夛紝鍚姩鏃朵互
  `-Dorg.gradle.java.home` 涓?`JAVA_HOME` 浼犵粰 Gradle锛涢潰鏉跨殑銆屾瀯寤虹幆澧冦€嶅彲浠ョ洿鎺ラ€夈€佷篃鍙互
  濉矾寰勬坊鍔犮€傝嚜鍔ㄦ寫閫夊彧鍦?澶х増鏈畬鍏ㄥ尮閰嶄笖 wrapper 鐨?Gradle 璺戝緱鍔?鏃舵帴绠♀€斺€斿畞鍙笉鎺ョ锛?  涔熶笉鎶婁竴涓湰鏉ヨ兘璺戠殑宸ョ▼鎹㈡垚涓嶅吋瀹圭殑 JVM銆?
114 涓祴璇曪紱`test/jdks.test.js` 瑕嗙洊浼樺厛绾т笌娉ㄥ叆鏉′欢锛宍test/api.test.js` 璧扮湡 api 琛ㄦ妸 JDK 閫夋嫨閾捐矾涓茶捣鏉ワ紝
`test/gradle.test.js` 瑕嗙洊瑙ｆ瀽淇銆?
### M12 鐘舵€佹寜 profile 闅旂锛?026-11-01锛?
杩愯璁板綍浠ュ墠鎵€鏈?profile 鍏辩敤涓€浠斤紝鍒?profile 浼氱湅鍒板埆鐨?profile 鐨勫疄渚嬨€傜幇鍦細

- **鐩綍**锛歚~/.dsh/mc-dev-starter/profiles/<name>/`锛坰tate.json + logs/锛夈€?- **鎬庝箞璁?profile**锛歛rgv 閲岀殑 `鈥?.dsh/profiles/<name>`锛堟闈㈢増锛夋垨 `--profile <name>`锛圕LI锛夛紝
  閮借涓嶅嚭鎵嶉€€鍥炲叡鐢ㄧ洰褰曘€?*argv 浼樺厛浜?`DSH_PROFILE`**鈥斺€旀闈㈢増浼氱粰鑷繁鐨勫瓙杩涚▼璁?  `DSH_PROFILE=desktop`锛屼粠妗岄潰閲屽惎鍔ㄧ殑 CLI 浼氱户鎵垮埌瀹冿紝鑰?CLI 鑷繁鐨?argv 鎵嶆槸鐪熺浉
  锛堝疄娴嬭俯杩囷細`dsh --profile m10smoke` 涓€寮€濮嬭鍒ゆ垚 desktop锛夈€?- **鏃ц褰?*锛氱涓€娆″湪鏌愪釜 profile 涓嬪惎鍔ㄦ椂锛屾妸鎷嗗垎鍓嶇殑 `state.json` + `logs/` 鎼繘鏉ヤ竴娆★紱
  鍙湁"鏂扮洰褰曡繕娌℃湁 state.json銆佹棫鐩綍鏈?鎵嶅姩锛屾惉涓嶅姩灏辨斁寮冿紙涓嶅奖鍝嶅惎鍔級銆?- **JDK 閫夋嫨涓嶈窡鐫€鍒?*锛歚jdk.json` 鐣欏湪鏍圭洰褰曪紝瀹冩槸鏈哄櫒绾у亸濂解€斺€斿悓涓€涓伐绋嬫崲 profile 涓嶈鎹?JDK銆?
楠岃瘉锛氱湡鏈鸿捣 `dsh --profile m10smoke`锛屽惎鍔ㄦ棩蹇楁墦鍗?`state dir: 鈥mc-dev-starter\profiles\m10smoke锛坧rofile: m10smoke锛塦锛?18 涓祴璇曘€?
### M13 鑳跺泭绌烘€侊紙2026-11-02锛?
闈?Minecraft 宸ヤ綔鍖洪噷鏍囬鏍忎篃鎸傜潃涓€涓€屾湭妫€娴嬪埌 MC 宸ョ▼銆嶇殑鐏拌兌鍥婏紝绾櫔闊炽€傜幇鍦細

- 鍒ゆ嵁鏄?`runTargets` 鑰屼笉鏄?loader锛氬簱宸ョ▼璇嗗埆寰楀嚭 loader 浣嗚窇涓嶄簡锛屽悓鏍蜂笉鏄剧ず銆?- 鏈夊疄渚嬪湪璺戯紙`starting` / `running`锛夋椂**蹇呴』鐣欑潃**锛屽惁鍒欓偅涓鍦ㄨ窇鐨勬父鎴忔病鏈夊仠姝㈡寜閽€?- 鎵弿涓笉鍗犱綅锛岄伩鍏嶅厛闂竴涓嬪啀娑堝け銆?- 椤哄甫淇簡榛樿閫変腑锛氫互鍓嶅彇鎵弿椤哄簭閲岀殑绗竴涓紙BFS 椤哄簭锛夛紝鐜板湪浼樺厛鍙栫涓€涓湁 run 鐩爣鐨勫伐绋嬨€?
### M14 澹版槑渚濊禆涓庡弻璇?README锛?026-11-03锛?
- **澹版槑渚濊禆**锛坄src/lib/deps.js`锛夛細瑙ｆ瀽 `dependencies { }` 鍧楋紙琛屽彿绮剧‘鍒板０鏄庨偅涓€琛岋級銆?  `gradle/libs.versions.toml`锛堝唴鑱旇〃 + `version.ref`锛夈€佸厓鏁版嵁 `depends`銆?  `libs.xxx` 鐨勪袱绉嶈闂櫒鍐欐硶锛坄libs.fabric.loader` / `libs.fabricLoader`锛夐兘鑳借В鏋愭垚鐪熷疄鍧愭爣锛?  瑙ｆ瀽涓嶅嚭鏉ュ氨淇濈暀鍘熷紩鐢紝涓嶇寽銆傞潰鏉裤€屼緷璧栥€嶅尯鍧椾笌 `mc_project_detail` 閮借緭鍑鸿繖浠芥竻鍗曘€?- **TOML 琛ュ唴鑱旇〃**锛歚parseToml` 浠ュ墠鎶?`{ module = "鈥?, version = "鈥? }` 褰撳瓧绗︿覆杩斿洖锛?  鐗堟湰鐩綍鍥犳鏁村潡澶辨晥锛涚幇鍦ㄦ敮鎸佸唴鑱旇〃锛堝惈 `version.ref` 鐐瑰彿閿級銆?- **README 榛樿鑻辨枃**锛歚README.md` 鑻辨枃銆乣README.zh_CN.md` 涓枃锛岄《閮ㄤ簰閾撅紝npm 鍖呰窡鐫€甯︿袱浠姐€?- 涓嶅仛銆屼緷璧栫鐞?/ 渚濊禆缂栬緫銆嶄笌銆孏radle 鍚屾銆嶏細鏀规瀯寤鸿剼鏈槸 agent 鐨勪簨锛?  杩欓噷鍙粰涓€涓彲浠ユ牳瀵圭殑绐楀彛銆?
128 涓祴璇曘€?
### M15 璇︽儏椤甸噸鍋氾紙2026-11-03锛?
鐢ㄦ埛瀹炴祴鍚庣殑涓変釜闂锛氭爣绛鹃〉娌″浘鏍囥€佷緷璧栧垪琛ㄩ噸澶嶄笖婧㈠嚭銆佹弧灞忚鏄庢枃瀛椼€傛敼娉曪細

- **鏍囩鍥炬爣**锛氭敞鍐?`sidebar.right.pane.tab.title`锛坘ey = tab 绫诲瀷 id锛夛紝杩斿洖"鍥炬爣 + 鏂囧瓧"鐨?  span锛屽拰鍐呯疆椤电鍚屼竴鐗堝紡銆備箣鍓嶈鐨?鍘熺敓鏍囩娌℃硶鏈夊浘鏍?鏄敊鐨勨€斺€旀病鏈夌殑鏄畾涔夐噷鐨?icon 瀛楁銆?- **渚濊禆鍘婚噸**锛氬悓涓€妯″潡鐨勫涓厤缃紙`modCompileOnly` + `modRuntimeOnly`锛夊悎骞舵垚涓€琛岋紝
  閰嶇疆鍒楃敤绌烘牸鍒嗛殧锛涗綅缃垪缂╂垚 `:116`锛屽畬鏁?`file:line` 杩?tooltip銆?- **涓嶅啀婧㈠嚭**锛歚.mcdev-detail` 鏁撮〉鍙粴锛屼緷璧栧垪琛ㄥ啀鏈?`max-height: 240px` 鑷繁鐨勬粴鍔ㄦ潯銆?- **璇存槑鏂囧瓧鍏ㄩ儴鏀惰繘 鈸?*锛氬惎鍔ㄦ彁绀恒€佺洰鏍囬噷鐨?`?`銆佷緷璧栨潵婧愩€丣DK 鐢熸晥鏉ユ簮閮芥敼鎴?tooltip锛?  鐗堥潰涓婂彧鐣欓敭鍊笺€佽〃鏍间笌鍒楄〃銆傝瘉鎹笌渚濊禆鏀规垚鍙姌鍙犲尯鍧椼€?- 椤哄甫锛氭湰鏈?JDK 澶х増鏈幓閲嶏紙浠ュ墠浼氬嚭鐜?`25 / 21 / 21 / 21 / 17 / 11`锛夈€?
132 涓祴璇曘€?
### M16 IDE 宸ョ▼妯″瀷涓庡妯″潡锛?026-11-04锛?
mmyddd 鐨?PR #1 鍚堣繘鏉ワ細`.idea` 鎴愪负绗簩璇佹嵁婧愶紝鑱氬悎宸ョ▼鐨勫瓙妯″潡鍚勮嚜鎴愬伐绋嬨€?
- **璇佹嵁浼樺厛绾?*锛氭瀯寤鸿剼鏈槸涓伙紝`.idea` 鍙ˉ缂恒€俧acet 鐨?`FORGE` 涔熻鐩?NeoForge锛屾墍浠ュ畠缁濅笉
  鎺ㄧ炕宸插垽瀹氱殑 loader鈥斺€旂湡鏈洪獙璇侊細ProtectionEngineering 鐨?facet 鏄?`FORGE`锛宭oader 浠嶆槸 `neoforge`銆?- **瀛愭ā鍧楀伐绋?*锛歚settings.gradle` 鐨?include 鎴?`.idea` 妯″潡娓呭崟閲岀殑妯″潡鍚勮嚜鎴愬伐绋嬶紝浠诲姟甯?  `:妯″潡:浠诲姟` 鍓嶇紑锛屽湪 wrapper 鎵€鍦ㄧ殑鑱氬悎鏍规墽琛岋紙`gradleRoot` / `modulePath` 杩涚敾鍍忎笌宸ュ叿杈撳嚭锛夈€?  鍚堟垚宸ョ▼楠岃瘉锛氭敼鍓嶆妸瀛愭ā鍧楀垪鎴愮嫭绔嬪伐绋嬨€佺洰鏍囨槸瑁?`runClient`锛堝湪妯″潡鐩綍閲屾壘涓嶅埌 gradlew锛?  鏍规湰璧蜂笉鏉ワ級锛涙敼鍚庣洰鏍?`:modules/core:runClient`銆乬radleRoot 鎸囧洖鑱氬悎鏍广€?- **鑱氬悎鏍逛笉鍗曞垪**锛氬畠鐨勭洰鏍囦笌瀛愭ā鍧楅噸澶嶏紱鏍圭洰褰曡嚜宸辩殑 runs 鐩墠涓嶆彁渚涳紙README 宸茬煡闄愬埗閲屽啓浜嗭級銆?- **杩愯閰嶇疆**锛欼DE 閲岃窇杩囩殑 run 閰嶇疆琛ユ垚鐩爣骞舵爣 `source: 'idea-run-config'`锛屼紭鍏堢骇浣庝簬鏋勫缓鑴氭湰銆?- **鍚堝苟鍚庤ˉ鐨勬姢鏍?*锛堜笉鍦ㄥ師 PR 閲岋級锛歩ml 鍙宸ョ▼鐩綍鍐呯殑锛堝厠闅嗘潵鐨勪粨搴撲笉鑳藉€熸璇诲閮ㄦ枃浠讹級锛?  `rootOf` / `componentOf` 瀹瑰繊 undefined锛堝彧鏈?modules.xml銆佹病鏈?misc.xml 鐨勫伐绋嬩互鍓嶄細鎶涳級锛?  瀛愭ā鍧楃殑 `.idea` 鎽樿鍙畻鑷繁鐨勮繍琛岄厤缃紱鏂板 `test/xml.test.js`銆乣test/idea.test.js` 涓?  `test/fixtures-multi`銆?
155 涓祴璇曘€?
## 鍙戝竷璁板綍

- `0.1.0` 鈫?棣栫増銆?- `0.1.1` 鈫?淇€屾渶灏?profile 璧蜂笉鏉ャ€嶏細`webServer` 浠?`inject` 閲屾嬁鎺夛紝鏀圭敤
  `ctx.inject(['webServer'], 鈥?` 鍙€夌瓑寰呫€傚師鏉ュ湪娌℃湁 web 灞傜殑 profile锛堝彧鏈?`dsh-base`锛夐噷浼?  `pending (waiting for service: webServer)`锛屾暣涓?plugin tree 鍔犺浇澶辫触銆?- `0.1.2` 鈫?淇€岃 0.1.1 鍗存墦鍗?0.1.0銆嶏細`VERSION` 鏀逛负鍚姩鏃惰 `package.json`銆?- `0.1.3` 鈫?peer 渚濊禆銆佷粨搴撳厓鏁版嵁銆佹埅鍥句笌 README 閲嶅啓锛涜鎯呴〉鍘绘帀杩囨湡鏂囨銆?- `0.1.4` 鈫?杩愯鏃ュ織鎸夌骇鍒潃鑹诧紙`src/client/logFormat.js`锛夈€?- `0.1.5` 鈫?`logDock` 閰嶇疆锛氭棩蹇楀彲钀藉師鐢熷彸渚ф爮鎴?better-sidebar 搴曢儴宸ヤ綔鍙般€?- `0.1.6` 鈫?瑁?better-sidebar 鏃堕粯璁よ惤搴曢儴锛坄chooseLogDock` 榛樿 bottom锛夈€?  鏃ュ織绾у埆杩囨护銆佸叚涓伐鍏蜂笌缁撴瀯鍖栧綊鍥犮€乣mc_launch` 榛樿瓒呮椂 10 鍒嗛挓銆佹弿杩颁笌鏍煎紡淇銆?- `0.1.7` 鈫?楠岃瘉鍥炶矾锛氱洰鏍囧垎绫?daemon / oneshot銆佷竴娆℃€т换鍔＄殑 `verdict`銆?  `mc_launch` 鐨?`wait: exit`銆侀潰鏉跨姸鎬佽瘝锛涢『甯︿慨 `.gitignore` 璇激 `src/lib` 骞惰ˉ鍏ュ紩鎿庢簮鐮併€?- `0.1.8` 鈫?M11 + M12锛歚runs` 瀹瑰櫒 API 淇銆丣DK 閫夋嫨涓庢敞鍏ワ紙闈㈡澘鍙€夊彲鍔狅級銆?  杩愯璁板綍鎸?profile 鍒嗙洰褰曘€佽寖鍥村彧淇濈暀 Gradle 宸ョ▼銆?- `0.1.9` 鈫?M13锛氭病鏈夊彲杩愯宸ョ▼鏃朵笉鏄剧ず鑳跺泭锛?.1.8 鎵撳寘鍚庢墠鍙戠幇鐨勭┖鎬佸櫔闊筹級銆?- 寰呭彂 `0.1.10` 鈫?M14 + M15锛氬０鏄庝緷璧栬鍥俱€丷EADME 榛樿鑻辨枃骞朵繚鐣欎腑鏂囥€佽鎯呴〉閲嶅仛锛堟爣绛惧浘鏍?/ 渚濊禆鍘婚噸 / 鍏ㄦ枃 tooltip 鍖栵級銆?- 寰呭彂 `0.1.11` 鈫?M16锛歚.idea` 宸ョ▼妯″瀷锛堟ā鍧楁竻鍗?/ facet / 宸ョ▼ JDK / 杩愯閰嶇疆锛夈€佸妯″潡宸ョ▼瀛愭ā鍧楀悇鑷垚宸ョ▼銆?  浠诲姟甯︽ā鍧楀墠缂€骞跺湪鑱氬悎鏍规墽琛屻€佺洰鏍囧甫 `source`銆佽鎯呴〉灞曠ず IDE 妯″瀷銆?
鍙戠増娉ㄦ剰锛?
- 璐﹀彿鐢ㄧ殑鏄?**granular token锛堝彧鍏佽鏆傚瓨锛?*锛岀洿鎺?`npm publish` 浼氳鎷掍负 `E_STAGE_REQUIRED`銆?  娴佺▼鏄?`npm stage publish` 鈫?`npm stage list`锛堢瓑 `validating` 缁撴潫锛夆啋
  `npm stage approve <stage-id>`锛堜汉宸ヨ繃 2FA锛夈€倀oken 涓嶈兘鎵瑰噯锛屾壒鍑嗗繀椤绘槸浜恒€?- `lib/client.js` 琚?`.gitignore` 蹇界暐锛屽彧閫氳繃 `package.json` 鐨?`files` 杩涘寘銆俙prepack` 浼氬湪
  鎵撳寘鍓嶈嚜鍔ㄦ瀯寤猴紝鎵€浠ャ€屽繕浜嗘瀯寤哄氨鍙戝竷銆嶅凡缁忎笉鍙兘锛沗npm run check:pack` 鍐嶇‘璁ゅ寘閲岀湡鐨勫甫涓婁簡
  瀹㈡埛绔笌鍏朵綑蹇呴渶鏂囦欢锛堝甯?`test/`銆乣.github/` 涔熶細琚垽澶辫触锛夈€傛敼浠ｇ爜鏃朵粛瑕佹墜鍔?`npm run build`锛?  鍚﹀垯鏈満 `link:` 瑁呯殑杩樻槸鏃т骇鐗┿€?*鏂?clone 涓嬫潵瑕佸厛鏋勫缓**锛屽惁鍒?`link:` 瀹夎鎷夸笉鍒板鎴风銆?- 鏂扮増鏈彂鍑哄幓鍚庯紝鐢ㄥ共鍑€ profile 瑁呬竴娆″苟鐪嬪惎鍔ㄦ棩蹇楅噷鐨?`host ready (x.y.z)`锛?  杩欐潯鍚屾椂楠岃瘉浜嗐€岀増鏈彿璇诲浜嗐€嶄笌銆屽寘缁撴瀯瀹屾暣銆嶃€?- 姣忎釜鍙戝竷鐗堟湰鎵?annotated tag `vX.Y.Z`锛屾寚鍚?`package.json` 宸叉槸璇ョ増鏈殑閭ｄ釜鎻愪氦銆?  琛ュ巻鍙?tag 鏃舵寜鐗堟湰鍙峰畾浣嶆彁浜わ紝鍒寜鏃ユ湡鐚滐細`git show <sha>:package.json` 閫愪釜鏍稿銆?- **git 鎺ㄩ€佸拰 npm 鍙戝竷鏄袱浠朵簨**锛歚git push` 闅忔椂鍙互鎺紙鍖呮嫭 tag锛夛紝鍙戝竷蹇呴』璧?鏆傚瓨 鈫?鐢ㄦ埛妫€鏌?鈫?鎵瑰噯"銆?  鎵瑰噯鍗冲彂甯冿紝鍖呭唴瀹逛箣鍚庝笉鍙啀鏀广€?- **鏆傚瓨涔嬪悗銆佹壒鍑嗕箣鍓嶆槸鍞竴鐨勬鏌ョ獥鍙?*銆傛鏂囥€丷EADME銆佹埅鍥剧殑淇敼瑕佸湪 `stage publish` 涔嬪墠鍋氬畬锛?  鏆傚瓨涔嬪悗鍐嶆敼灏卞緱璁╃敤鎴锋挙閿€閭ｆ潯鏆傚瓨锛坣pm 缃戦〉鎿嶄綔锛岄渶 2FA锛夛紝鐒跺悗閲嶆柊 `stage publish`銆?  鎾ら攢寰堜究瀹滐紝鍒€曢噸鍙戯紱浣嗗悓涓€鐗堟湰鍙兘鏈変竴鏉℃殏瀛橈紝鎾ら攢鍓嶉噸鍙戜細鎶?  `Cannot stage previously published version`锛堟帾杈炶瀵硷紝瀹為檯鏄殏瀛樺啿绐侊紝涓嶆槸鐪熺殑鍙戝竷杩囷級銆?
## 瀹夊叏鍛婅锛坣pm / Socket锛?
npm 鍖呴〉闈笂浼氬嚭鐜颁袱鏉″憡璀︼紝閮芥潵鑷?peer 渚濊禆鍥撅紝涓嶆槸鏈寘浠ｇ爜锛?
- **High CVE**锛歚zod@<4.6.6`锛圙HSA-mrhx-c7xc-m3w5锛夛紝缁?`@deepseek-ai/dsh-llm` 浼犲锛?  灞炰簬瀹樻柟杩愯鏃?`@deepseek-ai/dsh-tools` 鐨勬爲銆傛湰鍖?`dependencies` 涓虹┖锛屾敼涓嶄簡锛涘彧鑳界瓑涓婃父鍗?zod銆?- **Uses eval**锛?*璇姤**銆俙@deepseek-ai/dsh-ptc-runtime/lib/index.js` 閲屾湁涓€寮犱繚鐣欏瓧琛紝
  鍏朵腑涓€椤瑰氨鏄瓧绗︿覆 `"eval"`锛岄潤鎬佹壂鎻忔寜瀛楃涓插懡涓簡銆傛湰浠撳簱涓庝骇鐗╅噷 `\beval\b` 闆跺懡涓紙鍙鏌ワ級銆?
缁撹锛氫笉瑕佷负浜嗚繖涓ゆ潯鍘绘敼渚濊禆澹版槑锛堟妸 peer 鏀规垚 optional 涔熸尅涓嶄綇 CVE锛屽洜涓哄畠鏄湡瀹炵殑浼犻€掍緷璧栵級銆?闇€瑕佹竻闄よ鎶ュ氨寰€ Socket 鐨?false positive 閫氶亾鎻愶紱闇€瑕佷慨 CVE 灏辩瓑瀹樻柟鍗?`zod`銆?
## 杩樻病鍋氱殑浜?
- 妗岄潰鐗堢洰鍓嶄粛鐢?`link:` 瀹夎锛堟敼浠ｇ爜鍗虫椂鐢熸晥锛夛紱鍒囧埌 npm 鐗堟湰闇€瑕佹瘡娆℃敼瀹岄兘鍙戠増銆?