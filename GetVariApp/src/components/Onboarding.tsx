import React, { useState } from 'react';
import { UserProfile, WearableDevice, FitnessGoal, ActivityLevel, HabitRating } from '../types';
import { ChevronRight, ChevronLeft, ShieldCheck, Heart, Info, Radio, Check, CircleAlert, Waves, MapPin } from 'lucide-react';

interface OnboardingProps {
  onComplete: (profile: UserProfile, devices: WearableDevice[]) => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  // Form State
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [age, setAge] = useState<number>(26);
  const [gender, setGender] = useState<string>('Male');
  const [weight, setWeight] = useState<number>(75);
  const [medicalConditions, setMedicalConditions] = useState<string[]>([]);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal>('optimize_health');
  const [waterHabit, setWaterHabit] = useState<HabitRating>('moderate');

  // Location State
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationErrorMsg, setLocationErrorMsg] = useState<string>('');

  // Wearables State
  const [connectedHealthKit, setConnectedHealthKit] = useState(false);
  const [connectedHealthConnect, setConnectedHealthConnect] = useState(false);
  const [connectedHardware, setConnectedHardware] = useState(false);
  const [pairingHardware, setPairingHardware] = useState(false);

  const handleToggleCondition = (cond: string) => {
    if (cond === 'None') {
      setMedicalConditions(['None']);
    } else {
      setMedicalConditions((prev) => {
        const filtered = prev.filter((item) => item !== 'None');
        if (filtered.includes(cond)) {
          return filtered.filter((item) => item !== cond);
        } else {
          return [...filtered, cond];
        }
      });
    }
  };

  const popularCities = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Kolkata', 'Pune', 'Jaipur', 'San Francisco', 'London', 'New York', 'Tokyo'];

  const CITY_COORDINATES: { [key: string]: { lat: number; lon: number } } = {
    'Mumbai': { lat: 19.0760, lon: 72.8777 },
    'Delhi': { lat: 28.7041, lon: 77.1025 },
    'Bengaluru': { lat: 12.9716, lon: 77.5946 },
    'Hyderabad': { lat: 17.3850, lon: 78.4867 },
    'Ahmedabad': { lat: 23.0225, lon: 72.5714 },
    'Chennai': { lat: 13.0827, lon: 80.2707 },
    'Kolkata': { lat: 22.5726, lon: 88.3639 },
    'Pune': { lat: 18.5204, lon: 73.8567 },
    'Jaipur': { lat: 26.9124, lon: 75.7873 },
    'San Francisco': { lat: 37.7749, lon: -122.4194 },
    'London': { lat: 51.5074, lon: -0.1278 },
    'New York': { lat: 40.7128, lon: -74.0060 },
    'Tokyo': { lat: 35.6762, lon: 139.6503 }
  };

  const getClosestCity = (lat: number, lon: number): string => {
    let closestCity = 'Bengaluru';
    let minDistance = Infinity;
    for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
      const distance = Math.sqrt(Math.pow(coords.lat - lat, 2) + Math.pow(coords.lon - lon, 2));
      if (distance < minDistance) {
        minDistance = distance;
        closestCity = city;
      }
    }
    return closestCity;
  };

  const handleDetectLocation = () => {
    setIsLocating(true);
    setLocationErrorMsg('');
    setSelectedCity('');
    if (!navigator.geolocation) {
      setLocationErrorMsg('Geolocation is not supported by your browser.');
      setIsLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setLatitude(lat);
        setLongitude(lon);
        setIsLocating(false);
        const city = getClosestCity(lat, lon);
        setSelectedCity(city);
      },
      (error) => {
        console.error(error);
        setLocationErrorMsg('Unable to retrieve location. Select a city manually.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      // Complete Onboarding
      // Calculate target water intake based on weight and activity level
      // Baseline 35ml per kg, + 600ml for high activity, +1200ml for elite activity
      let targetMl = weight * 35;
      if (activityLevel === 'active') targetMl += 600;
      if (activityLevel === 'elite') targetMl += 1200;
      
      // Dynamic scaling based on selected clinical states:
      if (medicalConditions.includes('Diabetes')) {
        targetMl += 450; // High blood glucose demands increased osmotic dilution base
      }
      if (medicalConditions.includes('Kidney Disease')) {
        targetMl -= 250; // Renal tubular saturation limit warning
      }
      if (medicalConditions.includes('Hypertension')) {
        targetMl += 150; // Smooth steady clearance support
      }
      if (medicalConditions.includes('Chronic Heat-Stress')) {
        targetMl += 300; // Thermal reservoir padding
      }

      // Climate coefficient adjustments based on chosen location
      let climateModifier = 0;
      if (selectedCity) {
        const hotCities = ['Mumbai', 'Delhi', 'Chennai', 'Kolkata', 'Hyderabad', 'Ahmedabad', 'Jaipur'];
        const moderateCities = ['Bengaluru', 'Pune', 'Tokyo', 'San Francisco'];
        
        if (hotCities.some(city => selectedCity.includes(city))) {
          climateModifier = 350; // Extra hydration allocation for tropical climate baseline
        } else if (moderateCities.some(city => selectedCity.includes(city))) {
          climateModifier = 100; // Mild base elevation
        }
      }
      targetMl += climateModifier;

      targetMl = Math.round(targetMl / 50) * 55; // adaptive rounding
      targetMl = Math.min(4500, Math.max(1500, targetMl)); // bound healthy intake limits

      const completedProfile: UserProfile = {
        fullName,
        email,
        age,
        gender,
        weightKg: weight,
        activityLevel,
        fitnessGoal,
        waterHabit,
        targetDailyMl: targetMl,
        medicalConditions: medicalConditions.filter((c) => c !== 'None'),
        location: selectedCity || undefined,
        latitude: latitude || undefined,
        longitude: longitude || undefined,
      };

      const connectedDevices: WearableDevice[] = [
        { id: 'hk_01', name: 'Apple HealthKit', type: 'health_kit' as const, connected: connectedHealthKit },
        { id: 'ghc_01', name: 'Google Health Connect', type: 'health_connect' as const, connected: connectedHealthConnect },
        { id: 'gv_hw_01', name: 'GetVari Core ESP32', type: 'getvari_hardware' as const, connected: connectedHardware, batteryLevel: 100, lastSynced: new Date().toISOString() },
      ].filter((d) => d.connected);

      onComplete(completedProfile, connectedDevices);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // Simulated Hardware Pairing
  const handleHardwarePair = () => {
    if (connectedHardware) {
      setConnectedHardware(false);
      return;
    }
    setPairingHardware(true);
    setTimeout(() => {
      setPairingHardware(false);
      setConnectedHardware(true);
    }, 2200);
  };

  const activityOptions: { value: ActivityLevel; title: string; desc: string }[] = [
    { value: 'sedentary', title: 'Sedentary', desc: 'Minimal physical exertion. Remote work style.' },
    { value: 'light', title: 'Light Active', desc: 'Slight exertion. Light walks or stretching/yoga.' },
    { value: 'moderate', title: 'Moderate Load', desc: 'Moderate physical load, gym session 3-4x/week.' },
    { value: 'active', title: 'High Strain', desc: 'Daily athletic strain, high sweating baseline.' },
    { value: 'elite', title: 'Elite / Hybrid', desc: 'Double sessions daily or intensive endurance sports.' },
  ];

  const goalsOptions: { value: FitnessGoal; title: string; desc: string }[] = [
    { value: 'optimize_health', title: 'Optimize Longevity', desc: 'Maintain metabolic homeostasis and cellular health.' },
    { value: 'athletic_performance', title: 'Athletic Performance', desc: 'Maximize blood volume, cardiac output, and VO2-Max hydration.' },
    { value: 'cognitive_focus', title: 'Cognitive Performance', desc: 'Avoid brain cellular water deficits to maintain peak focus.' },
    { value: 'weight_management', title: 'Metabolic Focus', desc: 'Accelerate fat synthesis pathways and liver toxin dilution.' },
  ];

  return (
    <div id="onboarding-wizard-container" className="h-full flex flex-col justify-between bg-neutral-950 text-neutral-100 p-6 font-sans">
      
      {/* Upper Navigation Indicator Bar */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex gap-1.5">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx + 1 === step ? 'w-6 bg-cyan-400' : 'w-2 bg-neutral-800'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Main Wizard screens */}
      <div className="flex-1 flex flex-col justify-center">
        {step === 1 && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-gradient-to-br from-cyan-500/10 to-teal-500/15 border border-cyan-500/35 rounded-full shadow-2xl animate-pulse">
                <Waves className="w-10 h-10 text-cyan-400" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-extrabold tracking-tight flex items-center justify-center gap-0.5">
                <span className="font-light text-neutral-400">get</span><span className="text-white hover:text-cyan-400 transition-colors">Vāri</span>
              </h1>
              <p className="text-xs font-mono tracking-widest text-cyan-400 uppercase">AI-POWERED HYDRATION INTELLIGENCE</p>
              <p className="text-sm text-neutral-400 max-w-sm mx-auto font-sans leading-relaxed pt-2">
                Monitor hydration risk using real-time body signals like heart rate, activity, temperature, and recovery patterns.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Biometric Blueprint</h2>
              <p className="text-xs text-neutral-400 mt-1">Provide basic values to adjust hydration metabolic models.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-neutral-400 font-mono block mb-2">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[#050c18] border border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:border-cyan-400 focus:outline-none transition font-medium"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-400 font-mono block mb-2">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#050c18] border border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:border-cyan-400 focus:outline-none transition font-medium"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-400 font-mono block mb-2">Age (years)</label>
                <div className="flex gap-3 items-center">
                  <input
                    type="range"
                    min="14"
                    max="90"
                    value={age}
                    onChange={(e) => setAge(parseInt(e.target.value))}
                    className="flex-1 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <span className="text-lg font-bold font-mono text-cyan-400 w-12 text-right">{age}</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-400 font-mono block mb-2">Gender</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Female', 'Male', 'Non-Binary'].map((g) => (
                    <button
                      key={g}
                      onClick={() => setGender(g)}
                      className={`py-2 text-xs font-semibold rounded-lg border transition ${
                        gender === g
                          ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300 shadow-lg'
                          : 'border-neutral-800 bg-neutral-900/40 text-neutral-400'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-400 font-mono block mb-2">Baseline Weight (kg)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="40"
                    max="140"
                    value={weight}
                    onChange={(e) => setWeight(parseInt(e.target.value))}
                    className="flex-1 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <span className="text-lg font-bold font-mono text-cyan-400 w-12 text-right">{weight}kg</span>
                </div>
              </div>

              {/* Location Access Controls */}
              <div className="border-t border-white/5 pt-4">
                <label className="text-xs text-neutral-400 font-mono block mb-2">Location (Climate Tracking)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <select
                      value={popularCities.includes(selectedCity) ? selectedCity : ''}
                      onChange={(e) => {
                        setSelectedCity(e.target.value);
                        setLatitude(null);
                        setLongitude(null);
                        setLocationErrorMsg('');
                      }}
                      className="w-full bg-[#050c18] border border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:border-cyan-400 focus:outline-none transition cursor-pointer font-medium"
                    >
                      <option value="">-- Select City --</option>
                      {popularCities.map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={isLocating}
                    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                      latitude !== null
                        ? 'border-green-500/50 bg-green-950/20 text-green-300'
                        : 'border-cyan-500/25 bg-cyan-950/20 text-cyan-300 hover:bg-cyan-950/40'
                    }`}
                  >
                    <MapPin className={`w-3.5 h-3.5 ${isLocating ? 'animate-pulse' : ''}`} />
                    {isLocating ? 'Locating...' : latitude !== null ? 'Located' : 'Detect'}
                  </button>
                </div>

                {selectedCity && (
                  <div className="mt-2 text-[11px] text-cyan-400 font-mono flex items-center gap-1.5 bg-cyan-950/15 p-2 rounded-xl border border-cyan-500/10">
                    <Check className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Captured: <strong>{selectedCity}</strong></span>
                  </div>
                )}

                {locationErrorMsg && (
                  <div className="mt-2 text-[10px] text-red-400 font-mono flex items-center gap-1.5">
                    <CircleAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>{locationErrorMsg}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-fadeIn max-h-[420px] overflow-y-auto pr-1">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Pre-existing Medical States</h2>
              <p className="text-xs text-neutral-400 mt-1">Select any active diagnoses. GetVari dynamically tunes cardiovascular fluid strain thresholds and sweat predictions accordingly.</p>
            </div>

            <div className="space-y-2.5">
              {[
                { id: 'Diabetes', title: 'Diabetes (Type I/II)', desc: 'Heightened systemic glucose requires higher osmotic dilution. (+450ml adaptive cushion)' },
                { id: 'Hypertension', title: 'Hypertension / High BP', desc: 'Heart pressure feedback active. Micro-hydration bursts help reduce blood vessel resistance.' },
                { id: 'Kidney Disease', title: 'Kidney / Renal Disease', desc: 'Ensures strict clearance limit control to relieve tubules. (-250ml adaptive ceiling)' },
                { id: 'Cardiovascular Condition', title: 'Cardiovascular / Heart Condition', desc: 'Prevents rapid blood volume expansion; steady, predictable intake triggers active.' },
                { id: 'Chronic Heat-Stress', title: 'Climate Heat-Stress Proneness', desc: 'Compensates for early rapid transpiration and sweat rate spikes. (+300ml)' },
                { id: 'None', title: 'None / No Known Medical Conditions', desc: 'Standard metabolic baseline profile with general physical feedback.' }
              ].map((cond) => {
                const isSelected = medicalConditions.includes(cond.id);
                return (
                  <button
                    key={cond.id}
                    onClick={() => handleToggleCondition(cond.id)}
                    className={`w-full p-3 text-left rounded-xl border transition flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-cyan-400 bg-cyan-950/35 text-cyan-100 shadow-md'
                        : 'border-neutral-850 bg-neutral-900/40 text-neutral-400 hover:border-neutral-800'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <span className={`text-[13px] font-bold block ${isSelected ? 'text-cyan-400' : 'text-neutral-200'}`}>
                        {cond.title}
                      </span>
                      <span className="text-[10px] text-neutral-400 block leading-tight">{cond.desc}</span>
                    </div>
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${isSelected ? 'border-cyan-400 bg-cyan-400 text-neutral-950' : 'border-neutral-700'}`}>
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5 animate-fadeIn max-h-[420px] overflow-y-auto pr-1">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Metabolic Dynamics</h2>
              <p className="text-xs text-neutral-400 mt-1">Lifestyle habits dramatically update cellular sweating thresholds.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-neutral-400 font-mono block mb-2 uppercase tracking-wide">Daily Activity Strain</label>
                <div className="space-y-2">
                  {activityOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setActivityLevel(opt.value)}
                      className={`w-full p-3 text-left rounded-xl border transition flex flex-col ${
                        activityLevel === opt.value
                          ? 'border-cyan-400 bg-cyan-950/30 text-cyan-100 shadow-md'
                          : 'border-neutral-850 bg-neutral-900/40 text-neutral-400'
                      }`}
                    >
                      <span className={`text-xs font-bold ${activityLevel === opt.value ? 'text-cyan-400' : 'text-neutral-200'}`}>
                        {opt.title}
                      </span>
                      <span className="text-[10px] text-neutral-400 mt-0.5 leading-tight">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-400 font-mono block mb-2 uppercase tracking-wide">Wellness Goals</label>
                <div className="space-y-2">
                  {goalsOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFitnessGoal(opt.value)}
                      className={`w-full p-3 text-left rounded-xl border transition flex flex-col ${
                        fitnessGoal === opt.value
                          ? 'border-cyan-400 bg-cyan-950/30 text-cyan-100 shadow-md'
                          : 'border-neutral-850 bg-neutral-900/40 text-neutral-400'
                      }`}
                    >
                      <span className={`text-xs font-bold ${fitnessGoal === opt.value ? 'text-cyan-400' : 'text-neutral-200'}`}>
                        {opt.title}
                      </span>
                      <span className="text-[10px] text-neutral-400 mt-0.5 leading-tight">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-400 font-mono block mb-2 uppercase tracking-wide">Manual Water Intake Habits</label>
                <div className="grid grid-cols-3 gap-2">
                  {['low', 'moderate', 'high'].map((h) => (
                    <button
                      key={h}
                      onClick={() => setWaterHabit(h as HabitRating)}
                      className={`py-2 px-1 rounded-xl border transition flex flex-col items-center justify-center cursor-pointer ${
                        waterHabit === h
                          ? 'border-cyan-400 bg-cyan-950/45 text-cyan-300'
                          : 'border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      <span className="text-[10px] font-extrabold tracking-wider uppercase">
                        {h}
                      </span>
                      <span className="text-[8px] text-neutral-500 font-semibold tracking-normal lowercase mt-0.5">
                        compliance
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Sensor Synaptic Connect</h2>
              <p className="text-xs text-neutral-400 mt-1">Connect the proprietary GetVari wearable.</p>
            </div>

            <div className="space-y-3">
              {/* Proprietary GetVari Wearable node! */}
              <div className="p-4 bg-gradient-to-r from-neutral-900 to-neutral-900/70 rounded-xl border border-neutral-800/80 relative overflow-hidden">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 text-[9px] px-1.5 py-0.5 rounded font-mono tracking-widest uppercase inline-block">Prototyping Node</span>
                    <h4 className="text-xs font-extrabold text-neutral-100 flex items-center gap-1.5 pt-1">
                      <Radio className={`w-4 h-4 text-cyan-400 ${pairingHardware && 'animate-spin'}`} />
                      GetVari Wearable Node
                    </h4>
                    <p className="text-[10px] text-neutral-400 leading-normal max-w-[210px]">
                      Pairs directly over standard BLE.
                    </p>
                  </div>

                  <button
                    onClick={handleHardwarePair}
                    disabled={pairingHardware}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition cursor-pointer cursor-allowed ${
                      connectedHardware
                        ? 'bg-neutral-800 text-green-400 border border-green-500/40'
                        : pairingHardware
                        ? 'bg-cyan-950 text-cyan-400 border border-cyan-500/40'
                        : 'bg-cyan-500 text-neutral-950 font-extrabold hover:bg-cyan-400'
                    }`}
                  >
                    {connectedHardware ? (
                      <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Paired</span>
                    ) : pairingHardware ? (
                      'Syncing...'
                    ) : (
                      'Scan BLE'
                    )}
                  </button>
                </div>

                {pairingHardware && (
                  <div className="mt-3.5 space-y-2">
                    <div className="flex justify-between text-[10px] text-cyan-400 font-mono">
                      <span>SCANNING CARRIER WAVE...</span>
                      <span>RSSI -42 dBm</span>
                    </div>
                    <div className="w-full bg-neutral-850 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-cyan-400 to-teal-400 h-full w-2/3 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                )}

                {connectedHardware && (
                  <div className="mt-3 bg-green-500/10 border border-green-500/20 p-2 rounded-lg flex gap-2 items-center text-[10px] text-green-400 font-mono">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>ESP32 paired successfully. Simulated real-time streaming link established.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action / Navigation Buttons Bottom of Wizard */}
      <div className="flex gap-4 mt-8 border-t border-neutral-900 pt-5">
        {step > 1 && (
          <button
            onClick={handleBack}
            className="flex items-center justify-center gap-1.5 py-3 px-4 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900 rounded-xl text-xs font-semibold text-neutral-400 transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        )}
        <button
          onClick={handleNext}
          className="flex-1 flex items-center justify-center gap-1 py-3 px-4 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 rounded-xl text-xs font-extrabold text-neutral-950 transition cursor-pointer shadow-lg shadow-cyan-500/20"
        >
          {step === totalSteps ? 'Finalize connection' : 'Next'} <ChevronRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
}
