/**
 * The city table behind location capture.
 *
 * Climate is one of the inputs to the daily hydration goal, so the city a user
 * picks (or the nearest one to their GPS fix) has to resolve to coordinates
 * and a state. Onboarding and the profile editor both read from here rather
 * than each carrying their own copy of the list.
 */

export const popularCities = [
  "Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Ahmedabad", "Chennai", "Kolkata", "Surat", "Pune", "Jaipur",
  "Lucknow", "Kanpur", "Nagpur", "Indore", "Thane", "Bhopal", "Visakhapatnam", "Pimpri-Chinchwad", "Patna", "Vadodara",
  "Ghaziabad", "Ludhiana", "Agra", "Nashik", "Faridabad", "Meerut", "Rajkot", "Kalyan-Dombivli", "Vasai-Virar", "Varanasi",
  "Srinagar", "Aurangabad", "Dhanbad", "Amritsar", "Navi Mumbai", "Prayagraj", "Howrah", "Ranchi", "Gwalior", "Jabalpur",
  "Coimbatore", "Vijayawada", "Jodhpur", "Madurai", "Raipur", "Kota", "Guwahati", "Chandigarh", "Solapur", "Hubballi-Dharwad",
  "Bareilly", "Moradabad", "Mysuru", "Gurugram", "Aligarh", "Jalandhar", "Tiruchirappalli", "Bhubaneswar", "Salem", "Mira-Bhayandar",
  "Warangal", "Thiruvananthapuram", "Guntur", "Bhiwandi", "Saharanpur", "Gorakhpur", "Bikaner", "Amravati", "Noida", "Jamshedpur",
  "Bhilai", "Cuttack", "Firozabad", "Kochi", "Nellore", "Bhavnagar", "Dehradun", "Durgapur", "Asansol", "Rourkela",
  "Nanded", "Kolhapur", "Ajmer", "Akola", "Kalaburagi", "Jamnagar", "Ujjain", "Loni", "Siliguri", "Jhansi",
  "Ulhasnagar", "Jammu", "Sangli-Miraj & Kupwad", "Belagavi", "Mangaluru", "Ambattur", "Tirunelveli", "Malegaon", "Gaya", "Jalgaon"
];

export const CITY_COORDINATES: { [key: string]: { lat: number; lon: number } } = {
  'Mumbai': { lat: 19.0760, lon: 72.8777 },
  'Delhi': { lat: 28.6139, lon: 77.2090 },
  'Bengaluru': { lat: 12.9716, lon: 77.5946 },
  'Hyderabad': { lat: 17.3850, lon: 78.4867 },
  'Ahmedabad': { lat: 23.0225, lon: 72.5714 },
  'Chennai': { lat: 13.0827, lon: 80.2707 },
  'Kolkata': { lat: 22.5726, lon: 88.3639 },
  'Surat': { lat: 21.1702, lon: 72.8311 },
  'Pune': { lat: 18.5204, lon: 73.8567 },
  'Jaipur': { lat: 26.9124, lon: 75.7873 },
  'Lucknow': { lat: 26.8467, lon: 80.9462 },
  'Kanpur': { lat: 26.4499, lon: 80.3319 },
  'Nagpur': { lat: 21.1458, lon: 79.0882 },
  'Indore': { lat: 22.7196, lon: 75.8577 },
  'Thane': { lat: 19.2183, lon: 72.9781 },
  'Bhopal': { lat: 23.2599, lon: 77.4126 },
  'Visakhapatnam': { lat: 17.6868, lon: 83.2185 },
  'Pimpri-Chinchwad': { lat: 18.6298, lon: 73.7997 },
  'Patna': { lat: 25.5941, lon: 85.1376 },
  'Vadodara': { lat: 22.3072, lon: 73.1812 },
  'Ghaziabad': { lat: 28.6692, lon: 77.4538 },
  'Ludhiana': { lat: 30.9010, lon: 75.8573 },
  'Agra': { lat: 27.1767, lon: 78.0081 },
  'Nashik': { lat: 19.9975, lon: 73.7898 },
  'Faridabad': { lat: 28.4089, lon: 77.3178 },
  'Meerut': { lat: 28.9845, lon: 77.7064 },
  'Rajkot': { lat: 22.3039, lon: 70.8022 },
  'Kalyan-Dombivli': { lat: 19.2437, lon: 73.1352 },
  'Vasai-Virar': { lat: 19.3919, lon: 72.8397 },
  'Varanasi': { lat: 25.3176, lon: 82.9739 },
  'Srinagar': { lat: 34.0837, lon: 74.7973 },
  'Aurangabad': { lat: 19.8762, lon: 75.3433 },
  'Dhanbad': { lat: 23.7957, lon: 86.4304 },
  'Amritsar': { lat: 31.6340, lon: 74.8723 },
  'Navi Mumbai': { lat: 19.0330, lon: 73.0297 },
  'Prayagraj': { lat: 25.4358, lon: 81.8463 },
  'Howrah': { lat: 22.5958, lon: 88.2636 },
  'Ranchi': { lat: 23.3441, lon: 85.3096 },
  'Gwalior': { lat: 26.2124, lon: 78.1772 },
  'Jabalpur': { lat: 23.1815, lon: 79.9864 },
  'Coimbatore': { lat: 11.0168, lon: 76.9558 },
  'Vijayawada': { lat: 16.5062, lon: 80.6480 },
  'Jodhpur': { lat: 26.2389, lon: 73.0243 },
  'Madurai': { lat: 9.9252, lon: 78.1198 },
  'Raipur': { lat: 21.2514, lon: 81.6296 },
  'Kota': { lat: 25.2138, lon: 75.8648 },
  'Guwahati': { lat: 26.1445, lon: 91.7362 },
  'Chandigarh': { lat: 30.7333, lon: 76.7794 },
  'Solapur': { lat: 17.6599, lon: 75.9064 },
  'Hubballi-Dharwad': { lat: 15.3647, lon: 75.1240 },
  'Bareilly': { lat: 28.3670, lon: 79.4304 },
  'Moradabad': { lat: 28.8351, lon: 78.7733 },
  'Mysuru': { lat: 12.2958, lon: 76.6394 },
  'Gurugram': { lat: 28.4595, lon: 77.0266 },
  'Aligarh': { lat: 27.8974, lon: 78.0880 },
  'Jalandhar': { lat: 31.3260, lon: 75.5762 },
  'Tiruchirappalli': { lat: 10.7905, lon: 78.7047 },
  'Bhubaneswar': { lat: 20.2961, lon: 85.8245 },
  'Salem': { lat: 11.6643, lon: 78.1460 },
  'Mira-Bhayandar': { lat: 19.2906, lon: 72.8550 },
  'Warangal': { lat: 17.9689, lon: 79.5941 },
  'Thiruvananthapuram': { lat: 8.5241, lon: 76.9366 },
  'Guntur': { lat: 16.3067, lon: 80.4365 },
  'Bhiwandi': { lat: 19.2813, lon: 73.0483 },
  'Saharanpur': { lat: 29.9640, lon: 77.5460 },
  'Gorakhpur': { lat: 26.7606, lon: 83.3731 },
  'Bikaner': { lat: 28.0229, lon: 73.3119 },
  'Amravati': { lat: 20.9320, lon: 77.7523 },
  'Noida': { lat: 28.5355, lon: 77.3910 },
  'Jamshedpur': { lat: 22.8046, lon: 86.2029 },
  'Bhilai': { lat: 21.1938, lon: 81.3509 },
  'Cuttack': { lat: 20.4625, lon: 85.8830 },
  'Firozabad': { lat: 27.1508, lon: 78.4000 },
  'Kochi': { lat: 9.9312, lon: 76.2673 },
  'Nellore': { lat: 14.4426, lon: 79.9865 },
  'Bhavnagar': { lat: 21.7645, lon: 72.1519 },
  'Dehradun': { lat: 30.3165, lon: 78.0322 },
  'Durgapur': { lat: 23.5204, lon: 87.3119 },
  'Asansol': { lat: 23.6739, lon: 86.9524 },
  'Rourkela': { lat: 22.2604, lon: 84.8536 },
  'Nanded': { lat: 19.1628, lon: 77.3183 },
  'Kolhapur': { lat: 16.7050, lon: 74.2433 },
  'Ajmer': { lat: 26.4499, lon: 74.6399 },
  'Akola': { lat: 20.7002, lon: 77.0082 },
  'Kalaburagi': { lat: 17.3297, lon: 76.8343 },
  'Jamnagar': { lat: 22.4707, lon: 70.0577 },
  'Ujjain': { lat: 23.1760, lon: 75.7885 },
  'Loni': { lat: 28.7505, lon: 77.2889 },
  'Siliguri': { lat: 26.7271, lon: 88.3953 },
  'Jhansi': { lat: 25.4484, lon: 78.5685 },
  'Ulhasnagar': { lat: 19.2215, lon: 73.1645 },
  'Jammu': { lat: 32.7266, lon: 74.8570 },
  'Sangli-Miraj & Kupwad': { lat: 16.8524, lon: 74.5815 },
  'Belagavi': { lat: 15.8497, lon: 74.4977 },
  'Mangaluru': { lat: 12.9141, lon: 74.8560 },
  'Ambattur': { lat: 13.1143, lon: 80.1480 },
  'Tirunelveli': { lat: 8.7139, lon: 77.7567 },
  'Malegaon': { lat: 20.5517, lon: 74.5085 },
  'Gaya': { lat: 24.7914, lon: 85.0002 },
  'Jalgaon': { lat: 21.0077, lon: 75.5626 }
};

export const INDIAN_CITIES = popularCities.map(city => {
  const states: { [key: string]: string } = {
    'Mumbai': 'Maharashtra', 'Delhi': 'Delhi', 'Bengaluru': 'Karnataka', 'Hyderabad': 'Telangana', 'Ahmedabad': 'Gujarat',
    'Chennai': 'Tamil Nadu', 'Kolkata': 'West Bengal', 'Surat': 'Gujarat', 'Pune': 'Maharashtra', 'Jaipur': 'Rajasthan',
    'Lucknow': 'Uttar Pradesh', 'Kanpur': 'Uttar Pradesh', 'Nagpur': 'Maharashtra', 'Indore': 'Madhya Pradesh',
    'Thane': 'Maharashtra', 'Bhopal': 'Madhya Pradesh', 'Visakhapatnam': 'Andhra Pradesh', 'Pimpri-Chinchwad': 'Maharashtra',
    'Patna': 'Bihar', 'Vadodara': 'Gujarat', 'Ghaziabad': 'Uttar Pradesh', 'Ludhiana': 'Punjab', 'Agra': 'Uttar Pradesh',
    'Nashik': 'Maharashtra', 'Faridabad': 'Haryana', 'Meerut': 'Uttar Pradesh', 'Rajkot': 'Gujarat', 'Kalyan-Dombivli': 'Maharashtra',
    'Vasai-Virar': 'Maharashtra', 'Varanasi': 'Uttar Pradesh', 'Srinagar': 'Jammu & Kashmir', 'Aurangabad': 'Maharashtra',
    'Dhanbad': 'Jharkhand', 'Amritsar': 'Punjab', 'Navi Mumbai': 'Maharashtra', 'Prayagraj': 'Uttar Pradesh',
    'Howrah': 'West Bengal', 'Ranchi': 'Jharkhand', 'Gwalior': 'Madhya Pradesh', 'Jabalpur': 'Madhya Pradesh',
    'Coimbatore': 'Tamil Nadu', 'Vijayawada': 'Andhra Pradesh', 'Jodhpur': 'Rajasthan', 'Madurai': 'Tamil Nadu',
    'Raipur': 'Chhattisgarh', 'Kota': 'Rajasthan', 'Guwahati': 'Assam', 'Chandigarh': 'Chandigarh', 'Solapur': 'Maharashtra',
    'Hubballi-Dharwad': 'Karnataka', 'Bareilly': 'Uttar Pradesh', 'Moradabad': 'Uttar Pradesh', 'Mysuru': 'Karnataka',
    'Gurugram': 'Haryana', 'Aligarh': 'Uttar Pradesh', 'Jalandhar': 'Punjab', 'Tiruchirappalli': 'Tamil Nadu',
    'Bhubaneswar': 'Odisha', 'Salem': 'Tamil Nadu', 'Mira-Bhayandar': 'Maharashtra', 'Warangal': 'Telangana',
    'Thiruvananthapuram': 'Kerala', 'Guntur': 'Andhra Pradesh', 'Bhiwandi': 'Maharashtra', 'Saharanpur': 'Uttar Pradesh',
    'Gorakhpur': 'Uttar Pradesh', 'Bikaner': 'Rajasthan', 'Amravati': 'Maharashtra', 'Noida': 'Uttar Pradesh',
    'Jamshedpur': 'Jharkhand', 'Bhilai': 'Chhattisgarh', 'Cuttack': 'Odisha', 'Firozabad': 'Uttar Pradesh',
    'Kochi': 'Kerala', 'Nellore': 'Andhra Pradesh', 'Bhavnagar': 'Gujarat', 'Dehradun': 'Uttarakhand', 'Durgapur': 'West Bengal',
    'Asansol': 'West Bengal', 'Rourkela': 'Odisha', 'Nanded': 'Maharashtra', 'Kolhapur': 'Maharashtra', 'Ajmer': 'Rajasthan',
    'Akola': 'Maharashtra', 'Kalaburagi': 'Karnataka', 'Jamnagar': 'Gujarat', 'Ujjain': 'Madhya Pradesh', 'Loni': 'Uttar Pradesh',
    'Siliguri': 'West Bengal', 'Jhansi': 'Uttar Pradesh', 'Ulhasnagar': 'Maharashtra', 'Jammu': 'Jammu & Kashmir',
    'Sangli-Miraj & Kupwad': 'Maharashtra', 'Belagavi': 'Karnataka', 'Mangaluru': 'Karnataka', 'Ambattur': 'Tamil Nadu',
    'Tirunelveli': 'Tamil Nadu', 'Malegaon': 'Maharashtra', 'Gaya': 'Bihar', 'Jalgaon': 'Maharashtra'
  };
  return {
    city,
    state: states[city] || 'India',
    lat: CITY_COORDINATES[city].lat,
    lon: CITY_COORDINATES[city].lon
  };
});

/** Nearest known city to a GPS fix, by plain planar distance. */
/** Kilometres per degree of latitude — good enough for a nearest-city search. */
const KM_PER_DEGREE = 111;

export interface NearestCity {
  city: string;
  /** Great-circle-ish distance from the fix, in kilometres. */
  distanceKm: number;
}

/**
 * The closest city in the table to a fix, with how far away it is.
 *
 * The distance matters. This table is Indian cities only, so a fix taken
 * anywhere else still returns *something* — the old version answered with the
 * nearest Indian city and no way for the caller to know it was 6,000km out,
 * and defaulted to "Bengaluru" for a fix it could not place at all. Callers
 * now decide what is close enough to call the user's city.
 *
 * Longitude degrees are scaled by cos(latitude) so the comparison is in real
 * distance rather than in degrees, which would bias the result northwards.
 */
export const findNearestCity = (lat: number, lon: number): NearestCity | null => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const latScale = Math.cos((lat * Math.PI) / 180);
  let nearest: NearestCity | null = null;

  for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
    const dLat = (coords.lat - lat) * KM_PER_DEGREE;
    const dLon = (coords.lon - lon) * KM_PER_DEGREE * latScale;
    const distanceKm = Math.sqrt(dLat * dLat + dLon * dLon);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { city, distanceKm };
    }
  }

  return nearest;
};

/**
 * Beyond this, the nearest entry in the table is not the user's city and
 * saying so would be a guess. Roughly the radius within which a city's climate
 * band is still the right one to apply.
 */
export const NEAREST_CITY_LIMIT_KM = 150;

/**
 * The user's city for a fix, or null when no entry is close enough.
 *
 * Prefer this to `findNearestCity` unless you need the distance.
 */
export const getClosestCity = (lat: number, lon: number): string | null => {
  const nearest = findNearestCity(lat, lon);
  if (!nearest || nearest.distanceKm > NEAREST_CITY_LIMIT_KM) return null;
  return nearest.city;
};

export interface CityEntry {
  city: string;
  state: string;
  lat: number;
  lon: number;
}
