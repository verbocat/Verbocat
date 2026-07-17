const cheerio = require('cheerio');
const fs = require('fs');
const html = fs.readFileSync('../client/src/testing/new_fixed_output.html', 'utf-8');
const $ = cheerio.load(html);

console.log('====================================');
console.log('=== SEARCHING FOR SECTIONS c, d, e, f IN NEW FIXED OUTPUT ===');
console.log('====================================');

$('p, td, div, li').each((i, el) => {
  const text = $(el).text().trim();
  if (text.includes('बिजनेस रिलेशनशिप') || text.includes('गैर-कानूनी कामों') || text.includes('NACH मैंडेट') || text.includes('फीस और/या चार्जेस लगाने')) {
    if ($(el).find('p, td, div, li').length === 0) {
      console.log('\n--- SECTION ITEM ---');
      console.log(text);
    }
  }
});
