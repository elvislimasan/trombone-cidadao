import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_PAYMENT_MEASUREMENT, paymentMeasurementFields, resolvePaymentContractor, validateMeasurementPdf, uploadPaymentMeasurementPdf, uploadPaymentPhotoReportPdf } from '../lib/workPaymentMeasurement.js';

const contractors = [{ id: 'a', name: 'Construtora A' }, { id: 'b', name: 'Construtora B' }];

test('seleção vincula o ID e usa o nome do cadastro, preservando campos opcionais', () => {
  assert.deepEqual(paymentMeasurementFields({ ...EMPTY_PAYMENT_MEASUREMENT, contractor_id: 'a', creditor_name: 'Nome digitado' }, contractors), {
    contractor_id: 'a', creditor_name: 'Construtora A', measurement_pdf_url: null, photo_report_pdf_url: null, measurement_date: null,
    execution_start_date: null, execution_end_date: null,
  });
  assert.equal(paymentMeasurementFields({ creditor_name: 'Credor antigo' }, contractors).creditor_name, 'Credor antigo');
  assert.throws(() => paymentMeasurementFields({ contractor_id: 'missing' }, contractors), /cadastrada/);
});

test('relatório fotográfico mantém seu próprio link e rejeita protocolos inválidos', () => {
  const fields = paymentMeasurementFields({
    measurement_pdf_url: 'https://example.com/boletim.pdf',
    photo_report_pdf_url: '  https://example.com/fotos.pdf  ',
  }, []);
  assert.equal(fields.measurement_pdf_url, 'https://example.com/boletim.pdf');
  assert.equal(fields.photo_report_pdf_url, 'https://example.com/fotos.pdf');
  assert.throws(() => paymentMeasurementFields({ photo_report_pdf_url: 'javascript:alert(1)' }, []), /relatório fotográfico/);
});

test('upload do relatório fotográfico usa PDF validado e caminho próprio na fase', async () => {
  const file = { name: 'fotos.pdf', type: 'application/pdf', size: 100 };
  const supabase = { storage: { from(bucket) {
    assert.equal(bucket, 'work-media');
    return {
      async upload(path, value, options) {
        assert.equal(value, file);
        assert.deepEqual(options, { contentType: 'application/pdf' });
        return { error: null };
      },
      getPublicUrl(path) { return { data: { publicUrl: `https://example.com/${path}` } }; },
    };
  } } };
  assert.equal(await uploadPaymentPhotoReportPdf(supabase, 'fase-1', null), null);
  const result = await uploadPaymentPhotoReportPdf(supabase, 'fase-1', file);
  assert.match(result.path, /^measurements\/fase-1\/documents\/[a-f0-9-]+-relatorio-fotografico\.pdf$/);
  assert.equal(result.url, `https://example.com/${result.path}`);
  await assert.rejects(uploadPaymentPhotoReportPdf(supabase, 'fase-1', { ...file, name: 'fotos.jpg' }), /relatório fotográfico/);
  await assert.rejects(uploadPaymentPhotoReportPdf(supabase, 'fase-1', { ...file, size: 21 * 1024 * 1024 }), /20 MB/);
});

test('edição reconhece credores antigos apenas quando o nome identifica um cadastro único', () => {
  assert.equal(resolvePaymentContractor({ creditor_name: ' CONSTRUTORA A ' }, contractors), 'a');
  assert.equal(resolvePaymentContractor({ creditor_name: 'Construtora A' }, [...contractors, { id: 'c', name: 'Construtora A' }]), '');
  assert.equal(resolvePaymentContractor({ contractor_id: 'b' }, contractors), 'b');
});

test('boletim mantém data, link e período e rejeita período invertido ou link executável', () => {
  const form = { measurement_date: '2026-10-12', measurement_pdf_url: 'https://example.com/boletim.pdf',
    execution_start_date: '2026-09-01', execution_end_date: '2026-09-30' };
  const fields = paymentMeasurementFields(form, []);
  assert.equal(fields.measurement_pdf_url, form.measurement_pdf_url);
  assert.equal(fields.measurement_date, form.measurement_date);
  assert.equal(fields.execution_start_date, form.execution_start_date);
  assert.equal(fields.execution_end_date, form.execution_end_date);
  assert.throws(() => paymentMeasurementFields({ ...form, execution_end_date: '2026-08-31' }, []), /posterior/);
  assert.throws(() => paymentMeasurementFields({ measurement_pdf_url: 'javascript:alert(1)' }, []), /HTTP/);
  assert.equal(paymentMeasurementFields({ execution_end_date: form.execution_end_date }, []).execution_start_date, null);
});

test('anexo aceita apenas PDF até 20 MB, incluindo arquivos sem MIME informado', () => {
  assert.doesNotThrow(() => validateMeasurementPdf({ name: 'boletim.PDF', type: '', size: 100 }));
  assert.doesNotThrow(() => validateMeasurementPdf(null));
  assert.throws(() => validateMeasurementPdf({ name: 'documento.doc', type: '', size: 100 }), /PDF/);
  assert.throws(() => validateMeasurementPdf({ name: 'falso.pdf', type: 'text/html', size: 100 }), /PDF/);
  assert.throws(() => validateMeasurementPdf({ name: 'boletim.pdf', type: 'application/pdf', size: 21 * 1024 * 1024 }), /20 MB/);
});

test('upload do boletim usa a pasta da fase e só fornece URL após envio bem-sucedido', async () => {
  const file = { name: 'boletim.pdf', type: 'application/pdf', size: 100 };
  const uploads = [];
  const urls = [];
  let uploadError = null;
  const supabase = { storage: { from(bucket) {
    assert.equal(bucket, 'work-media');
    return {
      async upload(path, value, options) { uploads.push({ path, value, options }); return { error: uploadError }; },
      getPublicUrl(path) { urls.push(path); return { data: { publicUrl: `https://example.com/${path}` } }; },
    };
  } } };
  assert.equal(await uploadPaymentMeasurementPdf(supabase, 'fase-1', null), null);
  const result = await uploadPaymentMeasurementPdf(supabase, 'fase-1', file);
  assert.match(result.path, /^measurements\/fase-1\/documents\/[a-f0-9-]+-boletim\.pdf$/);
  assert.equal(result.url, `https://example.com/${result.path}`);
  assert.equal(uploads[0].value, file);
  assert.deepEqual(uploads[0].options, { contentType: 'application/pdf' });
  uploadError = new Error('Upload recusado');
  await assert.rejects(uploadPaymentMeasurementPdf(supabase, 'fase-1', file), /Upload recusado/);
  assert.equal(urls.length, 1);
});
