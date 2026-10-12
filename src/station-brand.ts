// Generic station branding for the reusable MASTER build.
// Configure VITE_STATION_NAME and VITE_STATION_CITY for each deployment.
export const stationName = import.meta.env.VITE_STATION_NAME?.trim() || "Preem station";
export const stationNameUpper = stationName.toLocaleUpperCase("sv-SE");
export const stationCity = import.meta.env.VITE_STATION_CITY?.trim() || "stationen";
export const stationCityUpper = stationCity.toLocaleUpperCase("sv-SE");
