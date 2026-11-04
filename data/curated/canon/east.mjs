// 新月與恆河（兩河、希伯來、印度、波斯、阿拉伯）。欄位說明見 aegean.mjs；無作者的作品可給 country（「是哪一地區／民族的文學」）。
// 泰戈爾、馬哈福茲是諾貝爾星河的得主卡，這裡只收作品卡。
export default {
  book: "east",
  people: [
    { id: "vyasa", name: "毗耶娑", en: "Vyasa", hint: "mahabharata", legend: true, aka: ["相傳是《摩訶婆羅多》作者的印度聖仙是誰？"] },
    { id: "valmiki", name: "蟻垤", en: "Valmiki", aka: ["被尊為印度「最初的詩人」、相傳寫了《羅摩衍那》的是誰？"] },
    { id: "kalidasa", name: "迦梨陀娑", en: "Kalidasa", aka: ["被譽為「印度的莎士比亞」的古典梵語詩人是誰？"] },
    { id: "ferdowsi", name: "菲爾多西", en: "Ferdowsi", aka: ["用三十多年寫成波斯民族史詩的伊朗詩人是誰？"] },
    { id: "khayyam", name: "海亞姆", tw: "奧瑪·開儼", en: "Omar Khayyam", aka: ["兼為天文學家、數學家的波斯四行詩人是誰？"] },
    { id: "saadi", name: "薩迪", en: "Saadi Shirazi", aka: ["設拉子出身、遊歷各地三十年後寫下教誨文學名著的波斯詩人是誰？"] },
    { id: "rumi", name: "魯米", en: "Rumi", aka: ["蘇菲派神秘主義詩人、長詩被稱為「波斯文的《古蘭經》」的是誰？"] },
    { id: "gibran", name: "紀伯倫", en: "Kahlil Gibran", country: "黎巴嫩", aka: ["旅居美國、以散文詩寫愛與生命的黎巴嫩詩人是誰？"] },
  ],
  works: [
    { id: "gilgamesh", name: "吉爾伽美什", en: "Epic of Gilgamesh", country: "兩河流域", century: false, genre: "史詩", chars: [["恩奇都", "Enkidu"]], fame: ["已知世界最古老的英雄史詩是哪一部？"] },
    { id: "bookofdead", name: "亡靈書", en: "Book of the Dead", country: "古埃及", fame: ["放在墓中、指引死者通過冥界審判的古埃及咒文與頌歌集是哪一部？"] },
    { id: "oldtestament", name: "舊約", en: "Old Testament", country: "希伯來", chars: [["摩西", "Moses"]], fame: ["記載創世、出埃及與先知故事，彌爾頓《失樂園》取材的希伯來典籍是哪一部？"] },
    { id: "rigveda", name: "梨俱吠陀", en: "Rigveda", country: "印度", century: false, fame: ["印度最古老的詩歌總集是哪一部？"] },
    { id: "mahabharata", name: "摩訶婆羅多", en: "Mahabharata", by: "vyasa", genre: "史詩", chars: [["阿周那", "Arjuna"], ["黑天", "Krishna"]], fame: ["包含《薄伽梵歌》、寫般度族與俱盧族大戰的印度史詩是哪一部？"] },
    { id: "ramayana", name: "羅摩衍那", en: "Ramayana", by: "valmiki", genre: "史詩", chars: [["悉多", "Sita", ["摩訶婆羅多"]], ["神猴哈奴曼", "Hanuman"]], fame: ["神猴哈奴曼常被拿來與孫悟空比較，牠出自哪一部印度史詩？"] },
    { id: "shakuntala", name: "沙恭達羅", en: "Shakuntala", by: "kalidasa", chars: [["豆扇陀", "Dushyanta"]], fame: ["歌德曾作詩盛讚、說只要說出女主人公的名字就道盡天上人間一切的梵語劇作是哪一部？"] },
    { id: "meghaduta", name: "雲使", en: "Meghaduta", by: "kalidasa", fame: ["寫被貶的藥叉託雲給遠方妻子捎信的梵語抒情長詩是哪一部？"] },
    { id: "panchatantra", name: "五卷書", en: "Panchatantra", country: "印度", genre: "寓言", fame: ["為教育王子而編、以動物故事寄寓治國處世之道的印度寓言集是哪一部？"] },
    { id: "shahnameh", name: "列王紀", en: "Shahnameh", by: "ferdowsi", century: "11世紀", dated: "是菲爾多西歷時三十餘年寫成的波斯史詩，一般以公元1010年定稿為成書之年，屬11世紀（994年曾完成初稿）。", genre: "史詩", chars: [["魯斯塔姆", "Rostam"]] },
    { id: "rubaiyat", name: "魯拜集", en: "Rubaiyat of Omar Khayyam", by: "khayyam", century: false, fame: ["經英國詩人愛德華·菲茨傑拉德英譯而風行西方的波斯四行詩集是哪一部？"] },
    { id: "gulistan", name: "薔薇園", en: "Gulistan", by: "saadi", fame: ["以散文夾詩的故事講處世道理的波斯名著是哪一部？"] },
    { id: "masnavi", name: "瑪斯納維", en: "Masnavi", by: "rumi", fame: ["以蘆笛的哀訴開篇、由六卷敘事詩組成的蘇菲派詩集是哪一部？"] },
    { id: "nights", name: "一千零一夜", tw: "天方夜譚", en: "One Thousand and One Nights", country: "阿拉伯", chars: [["山魯佐德", "Scheherazade"], ["辛巴達", "Sinbad the Sailor"], ["阿里巴巴", "Ali Baba"], ["阿拉丁", "Aladdin"]], fame: ["宰相女兒每夜講一個故事、使國王不再殺人的故事集是哪一部？"] },
    { id: "gitanjali", name: "吉檀迦利", en: "Gitanjali", by: "羅賓德拉納特·泰戈爾", genre: "散文詩", fame: ["泰戈爾親自譯成英文、為他贏得 1913 年諾貝爾文學獎的「獻歌」集是哪一部？"] },
    { id: "straybirds", name: "飛鳥集", en: "Stray Birds", by: "羅賓德拉納特·泰戈爾", lines: ["使生如夏花之絢爛，死如秋葉之靜美"] },
    { id: "crescentmoon", name: "新月集", en: "The Crescent Moon", by: "羅賓德拉納特·泰戈爾", fame: ["徐志摩、胡適等人的「新月社」之名，取自泰戈爾哪一部詩集？"] },
    { id: "prophet", name: "先知", en: "The Prophet", by: "gibran", fame: ["主人公亞墨斯達法臨別前回答眾人關於愛、婚姻、孩子等問題的紀伯倫散文詩集是哪一部？"] },
    { id: "sandfoam", name: "沙與沫", en: "Sand and Foam", by: "gibran", lines: ["我們活著只為了去發現美，其他一切都是等待的種種形式"] },
  ],
  groups: [
    { id: "indianepics", name: "印度兩大史詩", kind: "works", members: ["摩訶婆羅多", "羅摩衍那"], pool: ["梨俱吠陀", "五卷書", "沙恭達羅", "雲使", "列王紀", "吉爾伽美什"] },
  ],
};
