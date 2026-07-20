const cheerio = require("cheerio");

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<note>
  <to>Tove</to>
  <from>Jani</from>
  <heading>Reminder</heading>
  <body>Don't forget me this weekend! <br /> Yes! <img src="image.jpg" /></body>
</note>`;

console.log("--- XML Mode ---");
const $xml = cheerio.load(sampleXml, { xmlMode: true, decodeEntities: false });
const body = $xml("body");
const children = body.contents();

children.each((_, child) => {
  if (child.type === "tag") {
    const clone = $xml(child).clone();
    clone.empty();
    console.log("Tag:", child.name, "Outer HTML:", $xml.html(clone));
  }
});
