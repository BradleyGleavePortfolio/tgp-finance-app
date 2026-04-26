// UX Psychology Report #4: Preference-Controlled Personalization
import { IsArray, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  homeModules?: string[];

  @IsOptional()
  @IsIn(['daily', 'weekly', 'off'])
  notificationCadence?: 'daily' | 'weekly' | 'off';

  @IsOptional()
  @IsIn(['gentle', 'direct', 'drill'])
  motivationalTone?: 'gentle' | 'direct' | 'drill';

  @IsOptional()
  @IsIn(['USD', 'EUR', 'GBP', 'CAD', 'AUD'])
  currency?: 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD';

  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 6])
  firstDayOfWeek?: 0 | 1 | 6;
}
