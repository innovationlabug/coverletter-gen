import type { Profile } from '../../src/lib/types';

export const baseProfile: Profile = {
  nombre: 'Ana Lucía Pérez',
  puestoActual: 'Analista de datos en Banco Industrial',
  empleadorActual: 'Banco Industrial, S.A.',
  salarioActual: 15000,
  monedaActual: 'GTQ',
  puestoDeseado: 'Data Engineer Senior',
  empresaDestino: 'Telus International',
  salarioDeseado: 19500,
  monedaDeseada: 'GTQ',
  aniosExperiencia: 5,
  logros:
    '- Automaticé reportes en Python que ahorraron 20 horas al mes.\n' +
    '- Con mi jefa Ana López migramos 3 bases de datos a BigQuery.\n' +
    '- Hoy gano Q15,000 y quiero crecer.\n' +
    '- Reduje en 30% los errores de conciliación.',
  oferta:
    'Data Engineer Senior — Telus International\nRequisitos:\n- Python y SQL avanzado\n- Experiencia con BigQuery o Snowflake\n- Orquestación con Airflow\nOfrecemos salario entre Q18,000 y Q22,000. Enviar CV a talento@telus.example.com o al 2222-3333.',
};
