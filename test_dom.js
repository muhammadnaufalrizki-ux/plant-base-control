const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const expectedIds = [
  'opNama', 'opPhone', 'opCodeUnit', 'formOperator',
  'mechNama', 'mechOpPhone', 'mechCodeUnit', 'formMechanic',
  'modalRFU', 'rfuOperatorNoticeBox', 'rfuOperatorName', 'rfuOperatorPhone', 'rfuOperatorPhoneStatus', 'rfuSendWaToOperator',
  'modalDetailOperatorPhoneContainer', 'modalDetailOperatorPhoneLink', 'modalDetailOperatorPhoneText'
];

let allFound = true;
expectedIds.forEach(id => {
  if (!html.includes(`id="${id}"`)) {
    console.error('MISSING ID IN HTML:', id);
    allFound = false;
  }
});

if (allFound) {
  console.log('SUCCESS: All expected DOM elements are present in index.html!');
} else {
  process.exit(1);
}
