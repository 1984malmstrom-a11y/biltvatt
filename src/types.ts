export interface Staff {
  id: string;
  name: string;
  color: string;
  active: number;
}
export interface WashProgram {
  id: string;
  name: string;
  price_sek: number;
  sort_order: number;
  active: number;
}
export interface Sale {
  id: string;
  staff_id: string;
  wash_program_id: string;
  price_sek: number;
  sold_at: string;
  voided_at: string | null;
  request_id: string;
}
export interface PersonStats {
  id: string;
  name: string;
  color: string;
  count: number;
  revenue: number;
  average: number;
  premiumShare: number;
}
export interface Stats {
  count: number;
  revenue: number;
  average: number;
  premiumShare: number;
  programs: { id: string; name: string; count: number; revenue: number }[];
  staff: PersonStats[];
  leaders: {
    count: PersonStats[];
    revenue: PersonStats[];
    average: PersonStats[];
    premiumShare: PersonStats[];
  };
  goals: {
    daily: number;
    monthly: number;
    dailyCount: number;
    monthlyCount: number;
  };
  range: { start: string; end: string };
}
