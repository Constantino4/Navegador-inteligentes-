import { SearchEngine } from './search-engine.js';

export interface BusinessPlace {
  id: string;
  name: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  rating?: number;
  userRatingsTotal?: number;
  category?: string;
  phoneNumber?: string;
  website?: string;
  openNow?: boolean;
  weekdayHours?: string[];
  directionsUrl?: string;
}

export interface MapSearchResult {
  query: string;
  places: BusinessPlace[];
  center: { lat: number; lng: number };
}

// Built-in Google Maps Demo Key from AI Studio project
const DEFAULT_GOOGLE_MAPS_KEY = 'AIzaSyBlyMjf1yOFUNic4_tJ_x9suVCeSS_Iuws';

export class PlacesService {
  /**
   * Searches for verified businesses and places on the backend using Google Places API (New).
   * Runs in milliseconds with full data: ratings, phone, address, website and coordinates.
   */
  public static async searchPlaces(query: string, maxResults: number = 8): Promise<MapSearchResult> {
    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      DEFAULT_GOOGLE_MAPS_KEY;

    // Primary: Google Places API (New) searchText endpoint
    if (apiKey && apiKey.startsWith('AIza')) {
      try {
        const result = await this.searchGooglePlaces(query, apiKey, maxResults);
        if (result.places && result.places.length > 0) {
          return result;
        }
      } catch (err) {
        console.warn('[PlacesService] Google Places API warning, checking fallback:', err);
      }
    }

    // Secondary fallback: Fast geocoding & OpenStreetMap
    return this.searchFastOsm(query, maxResults);
  }

  private static async searchGooglePlaces(
    query: string,
    apiKey: string,
    maxResults: number
  ): Promise<MapSearchResult> {
    const url = 'https://places.googleapis.com/v1/places:searchText';
    const fieldMask = [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.location',
      'places.rating',
      'places.userRatingCount',
      'places.primaryTypeDisplayName',
      'places.nationalPhoneNumber',
      'places.internationalPhoneNumber',
      'places.websiteUri',
      'places.regularOpeningHours',
      'places.currentOpeningHours',
    ].join(',');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
        'X-Goog-Maps-Solution-ID': 'GMP_aistudio_agent',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: Math.min(maxResults, 10),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Places API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawPlaces = data.places || [];

    const places: BusinessPlace[] = rawPlaces.map((p: any) => ({
      id: p.id,
      name: p.displayName?.text || 'Empresa',
      formattedAddress: p.formattedAddress || '',
      location: {
        lat: p.location?.latitude || 0,
        lng: p.location?.longitude || 0,
      },
      rating: p.rating,
      userRatingsTotal: p.userRatingCount,
      category: p.primaryTypeDisplayName?.text,
      phoneNumber: p.internationalPhoneNumber || p.nationalPhoneNumber,
      website: p.websiteUri,
      openNow: p.currentOpeningHours?.openNow ?? p.regularOpeningHours?.openNow,
      weekdayHours: p.regularOpeningHours?.weekdayDescriptions,
      directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        p.formattedAddress || p.displayName?.text || ''
      )}`,
    }));

    const validCoords = places.filter(p => p.location.lat !== 0 && p.location.lng !== 0);
    const avgLat = validCoords.length > 0
      ? validCoords.reduce((acc, p) => acc + p.location.lat, 0) / validCoords.length
      : 38.7223;
    const avgLng = validCoords.length > 0
      ? validCoords.reduce((acc, p) => acc + p.location.lng, 0) / validCoords.length
      : -9.1393;

    return {
      query,
      places,
      center: { lat: avgLat, lng: avgLng },
    };
  }

  public static async getPlaceDetails(placeId: string): Promise<BusinessPlace | null> {
    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      DEFAULT_GOOGLE_MAPS_KEY;

    if (apiKey && apiKey.startsWith('AIza') && placeId.length > 15 && !placeId.startsWith('osm_')) {
      try {
        const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
        const res = await fetch(url, {
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
              'id,displayName,formattedAddress,location,rating,userRatingCount,primaryTypeDisplayName,nationalPhoneNumber,internationalPhoneNumber,websiteUri,regularOpeningHours,currentOpeningHours',
            'X-Goog-Maps-Solution-ID': 'GMP_aistudio_agent',
          },
        });
        if (res.ok) {
          const p = await res.json();
          return {
            id: p.id,
            name: p.displayName?.text || 'Empresa',
            formattedAddress: p.formattedAddress || '',
            location: {
              lat: p.location?.latitude || 0,
              lng: p.location?.longitude || 0,
            },
            rating: p.rating,
            userRatingsTotal: p.userRatingCount,
            category: p.primaryTypeDisplayName?.text,
            phoneNumber: p.internationalPhoneNumber || p.nationalPhoneNumber,
            website: p.websiteUri,
            openNow: p.currentOpeningHours?.openNow ?? p.regularOpeningHours?.openNow,
            weekdayHours: p.regularOpeningHours?.weekdayDescriptions,
            directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
              p.formattedAddress || p.displayName?.text || ''
            )}`,
          };
        }
      } catch (err) {
        console.warn('[PlacesService] Failed to get Google place details:', err);
      }
    }

    return null;
  }

  private static async searchFastOsm(query: string, maxResults: number): Promise<MapSearchResult> {
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&extratags=1&q=${encodeURIComponent(
        query
      )}&limit=${Math.min(maxResults, 8)}`;

      const res = await fetch(nominatimUrl, {
        headers: { 'User-Agent': 'Morph-AI-Browser/1.0' },
      });

      if (!res.ok) throw new Error('OSM failed');
      const rawPlaces = await res.json();

      const places: BusinessPlace[] = (rawPlaces || []).map((item: any) => {
        const lat = parseFloat(item.lat) || 0;
        const lng = parseFloat(item.lon) || 0;
        const name = item.name || item.display_name.split(',')[0];
        return {
          id: String(item.place_id || Math.random().toString(36).substring(2, 9)),
          name,
          formattedAddress: item.display_name,
          location: { lat, lng },
          category: item.type || 'Empresa',
          website: item.extratags?.website,
          phoneNumber: item.extratags?.phone,
          directionsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.display_name)}`,
        };
      });

      const avgLat = places.length > 0 ? places.reduce((a, b) => a + b.location.lat, 0) / places.length : 38.7223;
      const avgLng = places.length > 0 ? places.reduce((a, b) => a + b.location.lng, 0) / places.length : -9.1393;

      return {
        query,
        places,
        center: { lat: avgLat, lng: avgLng },
      };
    } catch {
      return {
        query,
        center: { lat: 38.7223, lng: -9.1393 },
        places: [],
      };
    }
  }
}
