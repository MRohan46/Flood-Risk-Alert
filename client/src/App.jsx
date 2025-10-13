import React, { useState, useEffect } from 'react';
import { AlertCircle, Droplets, MapPin, TrendingUp, Settings, Bell, X, ChevronRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import axios from "axios"
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Circle, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';


// Utility: smoothly move the map when location changes
import { useMap } from "react-leaflet";
const MapUpdater = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 8, { duration: 1.5 });
  }, [center]);
  return null;
};

const ResizeMap = () => {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
  }, [map]);
  return null;
};

async function getCityCoords(city) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?city=${city}&format=json`);
  const data = await res.json();
  if (data.length > 0) {
    const { lat, lon } = data[0];
    return [parseFloat(lat), parseFloat(lon)];
  }
  return null;
}


const FloodAlertSystem = () => {
  const [alerts, setAlerts] = useState([]);
  const [historicalData, setHistoricalData] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showNotification, setShowNotification] = useState(true);
  const [currentRiskLevel, setCurrentRiskLevel] = useState('high');
  const [mapZoom, setMapZoom] = useState(1);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [forecastData, setForecastData] = useState([]);
  const [center, setCenter] = useState(null);


  useEffect(() => {
    if (!selectedLocation) return;

    (async () => {
      const coords = await getCityCoords(selectedLocation);
      if (coords) setCenter(coords);
    })();
  }, [selectedLocation]);


  useEffect(() => {
    if (!selectedLocation || locations.length === 0) return;
    const locationData = locations.find(loc => loc.name === selectedLocation);
    if (locationData) setCurrentRiskLevel(locationData.risk);
  }, [selectedLocation, locations]);

  // Fetch all locations on mount
  useEffect(() => {
    axios.get('http://localhost:5000/api/locations')
      .then(res => {
        setLocations(res.data);
        if (res.data.length) setSelectedLocation(res.data[0].name);
      })
      .catch(err => console.error(err));
  }, []);
  // Fetch location-specific forecast and alerts
  useEffect(() => {
    console.log(selectedLocation)
    if (!selectedLocation) return;

    axios.get(`http://localhost:5000/api/forecast/${selectedLocation}`)
      .then(res => setForecastData(res.data))
      .catch(err => console.error(err));

    axios.get(`http://localhost:5000/api/alerts/${selectedLocation}`)
      .then(res => setAlerts(res.data.alerts))
      .catch(err => console.error(err));

  }, [selectedLocation]);

  // Fetch historical data (shared for all locations)
  useEffect(() => {
    axios.get('http://localhost:5000/api/history')
      .then(res => setHistoricalData(res.data))
      .catch(err => console.error(err));
  }, []);


  const riskColors = {
    low: { bg: '#4CAF50', text: 'Low Risk', glow: 'rgba(76, 175, 80, 0.3)' },
    medium: { bg: '#FFC107', text: 'Medium Risk', glow: 'rgba(255, 193, 7, 0.3)' },
    high: { bg: '#F44336', text: 'High Risk', glow: 'rgba(244, 67, 54, 0.3)' },
  };

  useEffect(() => {
    if (!selectedLocation || locations.length === 0) return;
    const found = locations.find(loc => loc.name === selectedLocation);
    if (found) setCurrentRiskLevel(found.risk);
  }, [selectedLocation, locations]);


  useEffect(() => {
    const interval = setInterval(() => {
      setMapZoom(prev => (prev === 1 ? 1.05 : 1));
    }, 2000);
    return () => clearInterval(interval);
  }, []);
  const currentLocation = locations?.find(loc => loc.name === selectedLocation);
  
  let colorName;

  // Custom icon generator for different risk levels
  const createIcon = (color) =>
    new L.Icon({
      iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color === "4CAF50" ? "green" : color === "FFC107" ? "yellow" : color === "F44336" ? "red" : "blue"}.png`,
      shadowUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });


  // Coordinates for major cities (temporary)
  let cityCoords
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0D1B2A] via-[#1B263B] to-[#0D1B2A] text-white font-sans">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 bg-black bg-opacity-30 backdrop-blur-md border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <Droplets className="w-8 h-8 text-blue-400" />
          <span className="text-2xl font-bold">FloodAlert</span>
        </div>
        <div className="flex items-center space-x-4">
          <button className="p-2 hover:bg-white hover:bg-opacity-10 rounded-lg transition-all">
            <Bell className="w-6 h-6" />
          </button>
          <button className="p-2 hover:bg-white hover:bg-opacity-10 rounded-lg transition-all">
            <Settings className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="font-bold">JD</span>
          </div>
        </div>
      </nav>

      {/* Notification Toast */}
      {showNotification && (
        <div className={`fixed top-20 right-6 z-50 animate-bounce`}>
          <div className={`bg-${riskColors[currentRiskLevel].bg} bg-opacity-90 backdrop-blur-md rounded-lg shadow-2xl p-4 flex items-center space-x-3 border-2 border-white border-opacity-20`}
               style={{ boxShadow: `0 0 30px ${riskColors[currentRiskLevel].glow}` }}>
            <AlertCircle className="w-6 h-6 animate-pulse" />
            <div className="flex-1">
              <p className="font-bold">⚠️ {riskColors[currentRiskLevel].text} Alert</p>
              <p className="text-sm opacity-90">Stay informed and safe!</p>
            </div>
            <button onClick={() => setShowNotification(false)} className="hover:bg-white hover:bg-opacity-20 rounded p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row h-[calc(100vh-80px)]">
        {/* Map Section */}
          <div className="flex-1 relative overflow-hidden">
            {/* Real Interactive Map */}
            <MapContainer
              center={[31.418, 73.079]} // Default: Faisalabad
              zoom={6}
              scrollWheelZoom={true}
              className="h-full w-full z-0"
              style={{ filwter: 'brightness(0.8) contrast(1.1)' }}
            >
              <ResizeMap />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">Carto</a>'
              />

              {/* Auto Move when Selected */}
              
              {center && <MapUpdater center={center} />}

              {/* Dynamic Markers */}
              {locations.map((loc, idx) => {
                
                const coords = [loc.lat, loc.lon];

                if (!coords) return null;
                return (
                  <Marker
                    key={idx}
                    position={coords}
                    icon={createIcon(riskColors[loc.risk].bg.replace('#', ''))}
                    eventHandlers={{
                      click: () => setSelectedLocation(loc.name),
                    }}
                  >
                    <Popup>
                      <strong>{loc.name}</strong><br />
                      Risk: {riskColors[loc.risk].text}<br />
                      River: {loc.riverLevel}m<br />
                      Rainfall: {loc.rainfall}mm
                    </Popup>
                  </Marker>
                );
              })}

              {/* Radius Circles */}
              {locations.map((loc, idx) => {

                const coords = [loc.lat, loc.lon];
                if (!coords) return null;
                const radius = loc.risk === 'high' ? 50000 : loc.risk === 'medium' ? 30000 : 15000;
                return (
                  <Circle
                    key={`circle-${idx}`}
                    center={coords}
                    radius={radius}
                    pathOptions={{
                      color: riskColors[loc.risk].bg,
                      fillColor: riskColors[loc.risk].bg,
                      fillOpacity: 0.25,
                    }}
                  />
                );
              })}
            </MapContainer>

            {/* Floating Risk Glow Overlays 
            <div className="absolute top-1/4 left-1/4 w-48 h-48 rounded-full animate-pulse pointer-events-none"
                style={{
                  background: `radial-gradient(circle, ${riskColors.high.glow} 0%, transparent 70%)`,
                  boxShadow: `0 0 60px ${riskColors.high.glow}`,
                }}></div>

            <div className="absolute top-1/2 right-1/4 w-32 h-32 rounded-full pointer-events-none"
                style={{
                  background: `radial-gradient(circle, ${riskColors.medium.glow} 0%, transparent 70%)`,
                }}></div>

            <div className="absolute bottom-1/4 left-1/2 w-24 h-24 rounded-full pointer-events-none"
                style={{
                  background: `radial-gradient(circle, ${riskColors.low.glow} 0%, transparent 70%)`,
                }}></div>
                */}
          </div>


        {/* Side Panel */}
        <div className="lg:w-96 bg-black bg-opacity-40 backdrop-blur-md border-l border-gray-700 overflow-y-auto">
          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 py-3 px-4 font-semibold transition-colors ${
                activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-white hover:bg-opacity-5'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-3 px-4 font-semibold transition-colors ${
                activeTab === 'history' ? 'bg-blue-600 text-white' : 'hover:bg-white hover:bg-opacity-5'
              }`}
            >
              History
            </button>
          </div>
          {activeTab === 'dashboard' ? (
            <div className="p-6 space-y-6">
              
              {/* Current Status */}
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700"
                   style={{ boxShadow: `0 0 40px ${riskColors[currentRiskLevel].glow}` }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">Current Location</h3>
                  <MapPin className="w-5 h-5" />
                </div>

                {/* Location Selector */}
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {locations.map((loc, i) => (
                    <option key={i} value={loc.name}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                <h2 className="text-2xl font-bold mb-2">{selectedLocation}</h2>
                <div className={`inline-block px-6 py-3 rounded-full text-xl font-bold`}
                     style={{ 
                       backgroundColor: riskColors[currentRiskLevel].bg,
                       boxShadow: `0 0 20px ${riskColors[currentRiskLevel].glow}`
                     }}>
                  {riskColors[currentRiskLevel].text}
                </div>
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="text-center">
                    <p className="text-gray-400 text-sm">Risk %</p>
                    <p className="text-2xl font-bold">{currentLocation?.percentage}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400 text-sm">Rainfall</p>
                    <p className="text-2xl font-bold">{currentLocation?.rainfall}mm</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400 text-sm">River Lvl</p>
                    <p className="text-2xl font-bold">{currentLocation?.riverLevel}m</p>
                  </div>
                </div>
              </div>

              {/* 24h Forecast */}
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Next 24 Hours
                </h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={forecastData.forecast}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="time" stroke="#9CA3AF" />
                    <YAxis stroke="#9CA3AF" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                    />
                    <Line type="monotone" dataKey="risk" stroke="#3B82F6" strokeWidth={3} dot={{ fill: '#3B82F6', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Alerts */}
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-4">Safety Alerts</h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {alerts.map(alert => (
                    <div key={alert.id} 
                         className={`p-3 rounded-lg border flex items-start space-x-3 hover:bg-white hover:bg-opacity-5 transition-all ${
                           alert.priority === 'high' ? 'border-red-500 bg-red-900 bg-opacity-20' : 'border-yellow-500 bg-yellow-900 bg-opacity-20'
                         }`}>
                      <AlertCircle className={`w-5 h-5 mt-0.5 ${alert.priority === 'high' ? 'text-red-400' : 'text-yellow-400'}`} />
                      <p className="text-sm flex-1">{alert.message}</p>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Historical Chart */}
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-4">Past Flood Events</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={historicalData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9CA3AF" />
                    <YAxis stroke="#9CA3AF" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                    />
                    <Bar dataKey="severity" fill="#F44336" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Timeline */}
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-4">Timeline</h3>
                <div className="space-y-4">
                  {historicalData.map((event, idx) => (
                    <div key={idx} className="flex items-start space-x-4">
                      <div className={`w-3 h-3 rounded-full mt-1.5 ${
                        event.severity > 70 ? 'bg-red-500' : event.severity > 40 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}></div>
                      <div className="flex-1">
                        <p className="font-semibold">{event.date}</p>
                        <p className="text-sm text-gray-400">{event.affected} households affected</p>
                        <p className="text-xs text-gray-500">Severity: {event.severity}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FloodAlertSystem;