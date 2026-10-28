// Takes location readings for up to `timeoutMs` and keeps the most accurate one.
// The server checks the accuracy radius, the reading's age and the geofence; this only gathers the best reading.
export type Reading = { lat: number; lng: number; accuracy: number; ageSeconds: number };

export function bestPosition(timeoutMs = 10_000, goodEnoughMetres = 15): Promise<Reading> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This browser can't share its location."));
      return;
    }
    let best: GeolocationPosition | null = null;
    const finish = () => {
      navigator.geolocation.clearWatch(watch);
      clearTimeout(timer);
      if (!best) {
        reject(new Error("No location reading. Turn on location for this site and try again."));
        return;
      }
      resolve({
        lat: best.coords.latitude,
        lng: best.coords.longitude,
        accuracy: best.coords.accuracy,
        ageSeconds: Math.max(0, (Date.now() - best.timestamp) / 1000),
      });
    };
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= goodEnoughMetres) finish();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          navigator.geolocation.clearWatch(watch);
          clearTimeout(timer);
          reject(new Error("Location access was denied. Allow it in your browser settings to time in."));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
    const timer = setTimeout(finish, timeoutMs);
  });
}
