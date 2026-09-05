export interface IllustrationFocusZone {
  left: string;
  top: string;
  width: string;
  height: string;
}

export interface ReportVehicleIllustration {
  id: string;
  title: string;
  yearStart: number;
  yearEnd: number;
  makes: string[];
  models: string[];
  bodyStyle: 'suv' | 'truck' | 'coupe' | 'convertible' | 'sedan' | 'sports-car';
  src: string;
  alt: string;
  focusZones: Record<string, IllustrationFocusZone>;
}

const K5_FOCUS_ZONES: Record<string, IllustrationFocusZone> = {
  engine: { left: '20%', top: '29%', width: '31%', height: '34%' },
  cooling: { left: '6%', top: '27%', width: '25%', height: '39%' },
  brakes: { left: '23%', top: '59%', width: '21%', height: '29%' },
  suspension: { left: '16%', top: '57%', width: '37%', height: '34%' },
  wheels: { left: '77%', top: '49%', width: '21%', height: '36%' },
  transmission: { left: '43%', top: '48%', width: '22%', height: '25%' },
  driveline: { left: '53%', top: '55%', width: '35%', height: '22%' },
  fuel: { left: '68%', top: '30%', width: '27%', height: '31%' },
  exhaust: { left: '48%', top: '53%', width: '42%', height: '22%' },
  electrical: { left: '25%', top: '23%', width: '66%', height: '39%' },
  undercarriage: { left: '17%', top: '52%', width: '72%', height: '32%' },
  body: { left: '18%', top: '12%', width: '76%', height: '52%' },
  test_drive: { left: '4%', top: '9%', width: '92%', height: '78%' },
};

const MUSTANG_FOCUS_ZONES: Record<string, IllustrationFocusZone> = {
  engine: { left: '17%', top: '35%', width: '30%', height: '29%' },
  cooling: { left: '4%', top: '38%', width: '24%', height: '31%' },
  brakes: { left: '34%', top: '61%', width: '20%', height: '27%' },
  suspension: { left: '28%', top: '55%', width: '29%', height: '34%' },
  wheels: { left: '75%', top: '48%', width: '20%', height: '30%' },
  transmission: { left: '42%', top: '48%', width: '23%', height: '24%' },
  driveline: { left: '51%', top: '51%', width: '35%', height: '22%' },
  fuel: { left: '76%', top: '34%', width: '20%', height: '28%' },
  exhaust: { left: '42%', top: '57%', width: '43%', height: '18%' },
  electrical: { left: '23%', top: '27%', width: '60%', height: '35%' },
  undercarriage: { left: '26%', top: '53%', width: '62%', height: '27%' },
  body: { left: '30%', top: '16%', width: '65%', height: '49%' },
  test_drive: { left: '3%', top: '12%', width: '93%', height: '72%' },
};

export const REPORT_VEHICLE_ILLUSTRATIONS: ReportVehicleIllustration[] = [
  {
    id: 'ford-mustang-1967-1970',
    title: '1967–1970 Ford Mustang',
    yearStart: 1967,
    yearEnd: 1970,
    makes: ['ford'],
    models: ['mustang', 'fastback'],
    bodyStyle: 'coupe',
    src: '/mustang-premium-cutaway.webp',
    alt: 'Detailed technical cutaway illustration of a classic Ford Mustang',
    focusZones: MUSTANG_FOCUS_ZONES,
  },
  {
    id: 'gm-k5-1969-1972',
    title: '1969–1972 Chevrolet K5 Blazer / GMC Jimmy',
    yearStart: 1969,
    yearEnd: 1972,
    makes: ['chevrolet', 'chevy', 'gmc'],
    models: ['k5', 'blazer', 'jimmy'],
    bodyStyle: 'suv',
    src: '/k5-premium-cutaway.webp',
    alt: 'Detailed first-generation Chevrolet K5 Blazer mechanical cutaway',
    focusZones: K5_FOCUS_ZONES,
  },
];

function normalize(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

export function findReportVehicleIllustration(year: number, make: string, model: string) {
  const normalizedMake = normalize(make);
  const normalizedModel = normalize(model);

  return REPORT_VEHICLE_ILLUSTRATIONS.find(illustration =>
    year >= illustration.yearStart && year <= illustration.yearEnd &&
    illustration.makes.some(candidate => normalizedMake.includes(candidate)) &&
    illustration.models.some(candidate => normalizedModel.includes(candidate))
  );
}

export function findIllustrationFocusZone(illustration: ReportVehicleIllustration, systemName: string) {
  const key = normalize(systemName);
  if (key.includes('engine')) return illustration.focusZones.engine;
  if (key.includes('cool')) return illustration.focusZones.cooling;
  if (key.includes('brake')) return illustration.focusZones.brakes;
  if (key.includes('suspension') || key.includes('steering')) return illustration.focusZones.suspension;
  if (key.includes('wheel') || key.includes('tire')) return illustration.focusZones.wheels;
  if (key.includes('transmission')) return illustration.focusZones.transmission;
  if (key.includes('driveline')) return illustration.focusZones.driveline;
  if (key.includes('fuel')) return illustration.focusZones.fuel;
  if (key.includes('exhaust')) return illustration.focusZones.exhaust;
  if (key.includes('electric')) return illustration.focusZones.electrical;
  if (key.includes('under')) return illustration.focusZones.undercarriage;
  if (key.includes('test') || key.includes('drive')) return illustration.focusZones.test_drive;
  return illustration.focusZones.body;
}
