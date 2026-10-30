begin;

alter table public.public_work_payments
  add column photo_report_pdf_url text,
  add constraint payment_photo_report_pdf_http check (
    photo_report_pdf_url is null or photo_report_pdf_url ~* '^https?://'
  );

comment on column public.public_work_payments.photo_report_pdf_url is
  'PDF público do relatório fotográfico referente ao boletim de medição do pagamento';

notify pgrst, 'reload schema';
commit;
