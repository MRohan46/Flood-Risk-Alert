import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config()
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const API_KEY = process.env.OPENWEATHER_API_KEY;  // put your key in .env

// Define your monitored locations (with lat/lon)
const locations = [
  { name: 'Faisalabad', lat: 31.418, lon: 73.079 },
  { name: 'Lahore', lat: 31.582, lon: 74.329 },
  { name: 'Karachi', lat: 24.8607, lon: 67.0011 },
  { name: 'Islamabad', lat: 33.6844, lon: 73.0479 },
];

// --- 🧠 New /api/locations (Dynamic by Country) ---
app.get('/api/locations', async (req, res) => {
  try {
    // 1️⃣ Detect user’s country by IP (fallback to Pakistan)
    const ipRes = await fetch('https://ipwho.is/');
    const ipData = await ipRes.json();
    const country = /*ipData.country ||*/ 'Germany';
    const userLat = ipData.latitude || 31.418;
    const userLon = ipData.longitude || 73.079;


    // 2️⃣ Get list of cities in the detected country
    const countryCitiesUrl = `https://countriesnow.space/api/v0.1/countries/cities`;
    const countryCitiesRes = await axios.post(countryCitiesUrl, { country });
    let cityList = countryCitiesRes.data.data || [];
    // If empty (fallback)
    if (!cityList.length) {
      cityList = ['Faisalabad', 'Lahore', 'Karachi', 'Islamabad', 'Multan'];
    }

    // Limit to top 5 cities for efficiency
    const selectedCities = cityList.slice(0, 10);

    // 3️⃣ Convert city names → lat/lon via OpenWeatherMap Geocoding
    const geoCities = await Promise.all(
      selectedCities.map(async (city) => {
        const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`;
        const geoRes = await axios.get(geoUrl);
        const geo = geoRes.data[0];
        if (!geo) return null;
        return { name: city, lat: geo.lat, lon: geo.lon };
      })
    );

    // Filter nulls (failed lookups)
    const validCities = geoCities.filter(Boolean);

    // 4️⃣ Fetch live weather + risk data
    const locations = await Promise.all(
      validCities.map(async (city) => {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${city.lat}&lon=${city.lon}&appid=${API_KEY}&units=metric`;
        const resp = await axios.get(url);
        const data = resp.data;

        const rain1h = data.rain?.['1h'] || 0;
        const rain3h = data.rain?.['3h'] || 0;
        const rainfall = Math.max(rain1h, rain3h);
        const humidity = data.main?.humidity || 0;
        const clouds = data.clouds?.all || 0;
        const wind = data.wind?.speed || 0;

        let estimatedRain = rainfall;
        if (rainfall === 0) {
          if (clouds > 70 && humidity > 60) estimatedRain = 2 + Math.random() * 3;
          else if (clouds > 40 && humidity > 50) estimatedRain = Math.random() * 2;
        }

        const risk = computeRisk(estimatedRain, humidity, clouds, wind);

        return {
          name: city.name,
          country,
          temp: data.main.temp,
          weather: data.weather[0].description,
          humidity,
          clouds,
          wind,
          rainfall: estimatedRain.toFixed(1),
          riverLevel: (estimatedRain / 2 + Math.random() * 0.5).toFixed(1),
          percentage: Math.min(100, Math.round(estimatedRain * 8 + humidity * 0.3 + clouds * 0.2)),
          risk,
          lat: city.lat,
          lon: city.lon,
        };
      })
    );

    res.json( locations );
  } catch (err) {
    console.error('Error in /api/locations:', err);
    res.status(500).json({ error: 'Failed to fetch dynamic locations' });
  }
});

// --- Risk computation helper ---
function computeRisk(rainfall, humidity = 0, clouds = 0, wind = 0) {
  let score = rainfall * 10 + humidity * 0.2 + clouds * 0.3 + wind * 1.5;

  if (score < 30) return "low";
  if (score < 60) return "medium";
  return "high";
}

// --- 🌤️ 5-Day Forecast for Specific Location ---
app.get('/api/forecast/:location', async (req, res) => {
  try {
    const locName = req.params.location.trim();

    // 1️⃣ Get accurate latitude & longitude from OpenWeather’s Geocoding API
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
      locName
    )}&limit=1&appid=${API_KEY}`;
    const geoRes = await axios.get(geoUrl);

    if (!geoRes.data.length) {
      return res.status(404).json({ error: 'City not found' });
    }

    const { lat, lon, name } = geoRes.data[0];

    // 2️⃣ Get 5-day / 3-hour forecast using accurate coordinates
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    const forecastRes = await axios.get(forecastUrl);
    const list = forecastRes.data.list;

    if (!list?.length) {
      return res.status(404).json({ error: 'No forecast data available' });
    }

    // 3️⃣ Extract next 8 readings (~24 hours) with simplified flood risk estimation
    const forecastData = list.slice(0, 8).map((item) => {
      const time = item.dt_txt.split(' ')[1].slice(0, 5); // e.g., "15:00"
      const rain = item.rain?.['3h'] || 0;
      const humidity = item.main.humidity || 0;
      const clouds = item.clouds.all || 0;

      // Simple heuristic for risk score (0–100)
      const risk = Math.min(
        100,
        Math.round(rain * 10 + humidity * 0.3 + clouds * 0.2)
      );

      return {
        time,
        temp: item.main.temp,
        weather: item.weather[0].description,
        rain,
        humidity,
        clouds,
        risk,
      };
    });

    // 4️⃣ Send structured forecast
    res.json({
      city: name,
      lat,
      lon,
      forecast: forecastData,
    });
  } catch (err) {
    console.error('Error in /api/forecast:', err.message);
    res.status(500).json({ error: 'Failed to fetch forecast data' });
  }
});
// --- 🌊 Flood History Endpoint ---
app.get('/api/history', async (req, res) => {
  try {
    const { country } = req.query;

    // 1️⃣ Detect user’s country if not provided
    let detectedCountry = country;
    if (!detectedCountry) {
      const ipRes = await fetch('https://ipwho.is/');
      const ipData = await ipRes.json();
      detectedCountry = ipData.country || 'Pakistan';
    }

    // 2️⃣ Fetch historical rainfall/flood data (OpenWeatherMap 5-day history-like approximation)
    // NOTE: OWM One Call historical API requires paid tier, so we simulate via recent daily weather.
    const geoRes = await axios.get(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
        detectedCountry
      )}&limit=1&appid=${API_KEY}`
    );
    const geo = geoRes.data[0];
    if (!geo) throw new Error('Could not resolve country coordinates');

    const { lat, lon } = geo;

    // Use OWM forecast data as pseudo-history (since no free historical endpoint)
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    const forecastRes = await axios.get(forecastUrl);
    const forecastData = forecastRes.data.list.slice(0, 5); // pick 5 snapshots

    // 3️⃣ Convert to history-like format 
    const historicalData = forecastData.map((entry, i) => {
      const date = new Date(entry.dt * 1000)
        .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const rain = entry.rain?.['3h'] || 0;
      const humidity = entry.main.humidity;
      const clouds = entry.clouds.all;

      // Estimate "severity" and "affected" people
      const severity = Math.min(100, Math.round(rain * 10 + humidity * 0.4 + clouds * 0.2));
      const affected = Math.round(severity * 5 + Math.random() * 200);

      return { date, severity, affected };
    });

    // 4️⃣ If API fails or gives no data, fallback
    if (!historicalData.length) {
      return res.json([
        { date: 'Jan 2024', severity: 40, affected: 120 },
        { date: 'Mar 2024', severity: 70, affected: 350 },
        { date: 'Jun 2024', severity: 30, affected: 80 },
        { date: 'Sep 2024', severity: 85, affected: 520 },
        { date: 'Oct 2024', severity: 65, affected: 280 },
      ]);
    }

    // 5️⃣ Send response
    res.json( historicalData );
  } catch (err) {
    console.error('Error in /api/history:', err);
    res.status(500).json({ error: 'Failed to fetch historical flood data' });
  }
});

// --- ⚠️ Dynamic Flood Alerts Based on Live Weather ---
app.get('/api/alerts/:location', async (req, res) => {
  try {
    const locName = req.params.location.trim();

    // 1️⃣ Get coordinates for the city
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
      locName
    )}&limit=1&appid=${API_KEY}`;
    const geoRes = await axios.get(geoUrl);
    if (!geoRes.data.length)
      return res.status(404).json({ error: 'City not found' });

    const { lat, lon, name } = geoRes.data[0];

    // 2️⃣ Get live weather data for that location
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    const weatherRes = await axios.get(weatherUrl);
    const data = weatherRes.data;

    const rain1h = data.rain?.['1h'] || 0;
    const rain3h = data.rain?.['3h'] || 0;
    const rainfall = Math.max(rain1h, rain3h);
    const humidity = data.main?.humidity || 0;
    const clouds = data.clouds?.all || 0;
    const wind = data.wind?.speed || 0;

    // 3️⃣ Compute actual risk
    const risk = computeRisk(rainfall, humidity, clouds, wind);

    // 4️⃣ Generate context-based alerts dynamically
    const alerts = [];

    if (risk === 'high') {
      alerts.push({
        id: 1,
        message: `🚨 High flood risk detected in ${name}.`,
        priority: 'high',
      });
      if (rainfall > 10)
        alerts.push({
          id: 2,
          message: 'Heavy rainfall observed — expect waterlogging in low-lying areas.',
          priority: 'high',
        });
      if (wind > 8)
        alerts.push({
          id: 3,
          message: 'Strong winds may worsen flooding near rivers.',
          priority: 'high',
        });
      alerts.push({
        id: 4,
        message: 'Stay alert, keep emergency supplies ready.',
        priority: 'high',
      });
    } else if (risk === 'medium') {
      alerts.push({
        id: 5,
        message: `🌧️ Moderate rainfall in ${name}. Stay cautious near canals and drains.`,
        priority: 'medium',
      });
      alerts.push({
        id: 6,
        message: 'Monitor local weather updates.',
        priority: 'medium',
      });
    } else {
      alerts.push({
        id: 7,
        message: `✅ Weather in ${name} is currently stable. No flood threat.`,
        priority: 'low',
      });
    }

    // 5️⃣ Respond cleanly
    res.json({
      city: name,
      lat,
      lon,
      risk,
      alerts,
      metrics: { rainfall, humidity, clouds, wind },
    });
  } catch (err) {
    console.error('Error in /api/alerts:', err.message);
    res.status(500).json({ error: 'Failed to generate dynamic alerts' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
