
class Pix {
  static formatField(id, value) {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
  }

  static crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc = crc << 1;
        }
      }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  }

  static generate(key, name, city, amount, txid = '***') {
    const amountStr = typeof amount === 'number' ? amount.toFixed(2) : amount;
    const merchantAccount = Pix.formatField('00', 'br.gov.bcb.pix') + Pix.formatField('01', key);
    
    let payload = 
      '000201' +
      Pix.formatField('26', merchantAccount) +
      Pix.formatField('52', '0000') +
      Pix.formatField('53', '986') +
      Pix.formatField('54', amountStr) +
      Pix.formatField('58', 'BR') +
      Pix.formatField('59', name) +
      Pix.formatField('60', city) +
      Pix.formatField('62', Pix.formatField('05', txid)) +
      '6304';

    return payload + Pix.crc16(payload);
  }
}

export default Pix;
