import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Database, DB } from '../db/db.module';
import { CategoriesService } from '../categories/categories.service';
import { cities, countries, countryWallets, districts } from '../db/schema';

// Données quasi statiques : le CDN peut les servir sans solliciter l'API.
const CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

const citiesQuery = z.object({
  country: z.string().length(2).transform((s) => s.toUpperCase()).optional(),
});
type CitiesQuery = z.infer<typeof citiesQuery>;
const districtsQuery = z.object({ cityId: z.coerce.number().int().positive() });

@Controller()
export class GeoController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly categoriesService: CategoriesService,
  ) {}

  @Get('geo/countries')
  @Header('Cache-Control', CACHE)
  async countries() {
    const rows = await this.db
      .select({
        code: countries.code,
        name: countries.name,
        dialCode: countries.dialCode,
        currencyCode: countries.currencyCode,
      })
      .from(countries)
      .where(eq(countries.isActive, true))
      .orderBy(asc(countries.name));
    // Portefeuilles électroniques du pays (MTN MoMo, Orange Money…), dans l'ordre d'affichage
    const wallets = await this.db.select().from(countryWallets).orderBy(asc(countryWallets.position));
    return { countries: rows.map((c) => ({ ...c, wallets: wallets.filter((w) => w.countryCode === c.code).map((w) => w.wallet) })) };
  }

  @Get('geo/cities')
  @Header('Cache-Control', CACHE)
  async cities(@Query(new ZodValidationPipe(citiesQuery)) q: CitiesQuery) {
    const rows = await this.db
      .select({ id: cities.id, countryCode: cities.countryCode, name: cities.name, slug: cities.slug })
      .from(cities)
      .innerJoin(countries, eq(countries.code, cities.countryCode))
      .where(and(eq(cities.isActive, true), eq(countries.isActive, true), q.country ? eq(cities.countryCode, q.country) : undefined))
      .orderBy(sql`${cities.slug} = 'autre'`, asc(cities.name)); // « Autres villes » en dernier
    return { cities: rows };
  }

  /** Quartiers d'une ville, par ordre alphabétique (le quartier d'une annonce est facultatif). */
  @Get('geo/districts')
  @Header('Cache-Control', CACHE)
  async districts(@Query(new ZodValidationPipe(districtsQuery)) q: { cityId: number }) {
    const rows = await this.db
      .select({ id: districts.id, cityId: districts.cityId, name: districts.name, slug: districts.slug })
      .from(districts)
      .where(and(eq(districts.cityId, q.cityId), eq(districts.isActive, true)))
      .orderBy(asc(districts.name));
    return { districts: rows };
  }

  @Get('categories')
  @Header('Cache-Control', CACHE)
  async categories() {
    return { categories: await this.categoriesService.tree() };
  }
}
