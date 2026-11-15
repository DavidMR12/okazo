import { Controller, Get, Header, Inject, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
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
/** Ville principale de chaque pays : ville par défaut quand l'adresse internet ne donne pas la ville. */
export const MAIN_CITY: Record<string, string> = { CM: 'douala', GA: 'libreville', CG: 'brazzaville', TD: 'ndjamena', CF: 'bangui', GQ: 'malabo' };
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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

  /**
   * Pays et ville du visiteur d'après son adresse internet, lus dans les en-têtes ajoutés par Cloudflare
   * (CF-IPCountry ; CF-IPCity avec la règle « Add visitor location headers »). Rien n'est enregistré.
   * Pays non ouvert (ou inconnu) : country null, l'application garde alors son propre choix.
   */
  @Get('geo/region')
  @Header('Cache-Control', 'private, no-store')
  async region(@Req() req: FastifyRequest) {
    const header = (name: string) => {
      const v = req.headers[name];
      return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
    };
    const code = header('cf-ipcountry').toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return { country: null, city: null };
    const { cities: list } = await this.cities({ country: code });
    if (!list.length) return { country: null, city: null };
    // En-tête en UTF-8 transmis tel quel ; « Yaoundé » et « Yaounde » se valent
    const ipCity = plain(Buffer.from(header('cf-ipcity'), 'latin1').toString('utf8'));
    const city = (ipCity && list.find((c) => c.slug !== 'autre' && (c.slug === ipCity || plain(c.name) === ipCity))) || null;
    return { country: code, city: city ? { id: city.id, slug: city.slug, name: city.name } : null };
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
