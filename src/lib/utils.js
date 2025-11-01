import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value, currencySymbol = true) {
  if (typeof value !== 'number') {
    return 'N/A';
  }
  const options = {
    style: 'currency',
    currency: 'BRL',
  };

  if (!currencySymbol) {
    options.style = 'decimal';
    options.minimumFractionDigits = 2;
    options.maximumFractionDigits = 2;
  }

  return new Intl.NumberFormat('pt-BR', options).format(value);
}


export function parseCurrency(value) {
  if (typeof value !== 'string') {
    return 0;
  }
  const onlyNumbers = value.replace(/\D/g, '');
  if (onlyNumbers === '') return 0;
  return Number(onlyNumbers) / 100;
}

export function formatCnpj(cnpj) {
  if (!cnpj) return '';
  cnpj = cnpj.replace(/\D/g, '');
  cnpj = cnpj.slice(0, 14);
  if (cnpj.length > 12) {
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
  } else if (cnpj.length > 8) {
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8)}`;
  } else if (cnpj.length > 5) {
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5)}`;
  } else if (cnpj.length > 2) {
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2)}`;
  }
  return cnpj;
};

export function formatTimeAgo(dateString) {
  if (!dateString) return 'Data não informada';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Data inválida';

  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  const decades = Math.floor(seconds / 315360000);
  if (decades > 0) return `há ${decades} década${decades > 1 ? 's' : ''}`;

  const years = Math.floor(seconds / 31536000);
  if (years > 0) return `há ${years} ano${years > 1 ? 's' : ''}`;

  const months = Math.floor(seconds / 2592000);
  if (months > 0) return `há ${months} ${months > 1 ? 'meses' : 'mês'}`;

  const days = Math.floor(seconds / 86400);
  if (days > 0) return `há ${days} dia${days > 1 ? 's' : ''}`;
  
  return 'hoje';
}