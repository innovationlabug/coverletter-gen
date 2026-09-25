import type { Profile } from '../lib/types';

/** Fictitious example profile for the "Usar un ejemplo" button. */
export const EXAMPLE_PROFILE: Profile = {
  nombre: 'María José Castillo',
  puestoActual: 'Analista de datos',
  empleadorActual: 'Banco Industrial, S.A.',
  salarioActual: 15000,
  monedaActual: 'GTQ',
  puestoDeseado: 'Data Engineer',
  empresaDestino: 'Telus International',
  salarioDeseado: 19000,
  monedaDeseada: 'GTQ',
  aniosExperiencia: 5,
  logros: [
    'Automaticé en Python los reportes de cartera, ahorrando 20 horas al mes al equipo.',
    'Con mi jefa Ana López migramos 3 bases de datos a BigQuery sin tiempo de inactividad.',
    'Hoy gano Q15,000 y siento que ya no estoy creciendo en el BI.',
    'Reduje en 30% los errores de conciliación con validaciones en SQL.',
  ].join('\n'),
  oferta: [
    'Data Engineer — Telus International (Guatemala, híbrido)',
    'Requisitos:',
    '- Python y SQL avanzado',
    '- Experiencia con BigQuery o Snowflake',
    '- Orquestación de pipelines con Airflow',
    'Ofrecemos salario entre Q18,000 y Q22,000. Indicar pretensión salarial.',
    'Enviar CV a talento@telus.example.com o al 2222-3333.',
  ].join('\n'),
};
