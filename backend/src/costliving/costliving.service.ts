import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';

export interface CostLivingRow {
  country: string;
  city: string;
  cost_index: number;
  monthly_cost_usd: number;
  rent_1br_city_center?: number;
  groceries_monthly?: number;
  transport_monthly?: number;
  utilities_monthly?: number;
  internet_monthly?: number;
}

@Injectable()
export class CostLivingService {
  private colData: CostLivingRow[] | null = null;

  private loadData(): CostLivingRow[] {
    if (this.colData) return this.colData;

    // Try multiple paths to find the data file
    const paths = [
      path.resolve(process.cwd(), 'data', 'cost_of_living_2026.json'),
      path.resolve(__dirname, '..', '..', '..', '..', 'data', 'cost_of_living_2026.json'),
      path.resolve(__dirname, '..', '..', '..', 'data', 'cost_of_living_2026.json'),
      path.resolve(process.cwd(), '..', 'data', 'cost_of_living_2026.json'),
    ];

    for (const dataPath of paths) {
      if (fs.existsSync(dataPath)) {
        const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        this.colData = parsed;
        return parsed;
      }
    }

    // Embedded minimal fallback so service always works
    return [
      { country: 'Portugal', city: 'Lisbon', cost_index: 55, monthly_cost_usd: 1950, rent_1br_city_center: 1200, groceries_monthly: 250, transport_monthly: 50, utilities_monthly: 100, internet_monthly: 30 },
      { country: 'Thailand', city: 'Chiang Mai', cost_index: 28, monthly_cost_usd: 950, rent_1br_city_center: 400, groceries_monthly: 150, transport_monthly: 30, utilities_monthly: 60, internet_monthly: 20 },
      { country: 'Colombia', city: 'Medellin', cost_index: 32, monthly_cost_usd: 1100, rent_1br_city_center: 500, groceries_monthly: 170, transport_monthly: 30, utilities_monthly: 60, internet_monthly: 22 },
      { country: 'Mexico', city: 'Mexico City', cost_index: 38, monthly_cost_usd: 1300, rent_1br_city_center: 650, groceries_monthly: 200, transport_monthly: 35, utilities_monthly: 75, internet_monthly: 22 },
      { country: 'United States', city: 'Austin', cost_index: 100, monthly_cost_usd: 3500, rent_1br_city_center: 1800, groceries_monthly: 450, transport_monthly: 120, utilities_monthly: 150, internet_monthly: 60 },
    ];
  }

  async getCountries() {
    return this.loadData();
  }

  async compareLocations(from: string, to: string, income: number) {
    const data = this.loadData();

    const fromLocation = data.find(
      (d) =>
        d.city?.toLowerCase().includes(from.toLowerCase()) ||
        d.country?.toLowerCase().includes(from.toLowerCase()),
    ) || { city: from, country: from, monthly_cost_usd: 3500, cost_index: 100 };

    const toLocation = data.find(
      (d) =>
        d.city?.toLowerCase().includes(to.toLowerCase()) ||
        d.country?.toLowerCase().includes(to.toLowerCase()),
    );

    if (!toLocation) {
      return { error: `Location "${to}" not found in database`, available: data.map((d) => d.city) };
    }

    const monthlySavings = fromLocation.monthly_cost_usd - toLocation.monthly_cost_usd;
    const annualSavings = monthlySavings * 12;
    const purchasingPowerMultiplier = (fromLocation.monthly_cost_usd / toLocation.monthly_cost_usd).toFixed(2);

    const effectiveTaxRate = 0.22;
    const estimatedTakeHome = income * (1 - effectiveTaxRate);

    return {
      from: fromLocation,
      to: toLocation,
      monthly_savings: Math.round(monthlySavings),
      annual_savings: Math.round(annualSavings),
      purchasing_power_multiplier: purchasingPowerMultiplier,
      income_unchanged: income,
      new_disposable_monthly: Math.round(estimatedTakeHome - toLocation.monthly_cost_usd),
      current_disposable_monthly: Math.round(estimatedTakeHome - fromLocation.monthly_cost_usd),
      disposable_increase: Math.round(
        (estimatedTakeHome - toLocation.monthly_cost_usd) -
        (estimatedTakeHome - fromLocation.monthly_cost_usd)
      ),
    };
  }
}
