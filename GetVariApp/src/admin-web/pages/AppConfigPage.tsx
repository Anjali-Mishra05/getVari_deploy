import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';

import GlassCard from '../components/shared/GlassCard';
import Button from '../components/shared/Button';
import AppConfigAdminService from '../services/AppConfigAdminService';
import type {
  ActivityLevelConfig,
  AppConfig,
  MedicalConditionConfig,
  WorkEnvironmentConfig,
} from '../../config/appConfigSchema';

/**
 * The screen behind "nothing should be hardcoded in the app".
 *
 * Diseases and everything that follows from them — how far each one moves the
 * daily goal, how it re-weights the risk engine, its PBWR ceiling, and whether
 * the app refuses to pace intake for it without a doctor's limit — are edited
 * here and fetched by every install. A change takes effect on each device's
 * next foreground; no release, no store review.
 *
 * The editor is deliberately a form over the real document rather than a JSON
 * textarea: a typo in a JSON blob is a broken onboarding screen for every user
 * at once, and the numeric inputs make the units explicit.
 */

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  step?: number;
  hint?: string;
}> = ({ label, value, onChange, suffix, step = 1, hint }) => (
  <label className="block">
    <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">{label}</span>
    <div className="flex items-center gap-2 mt-1">
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={event => {
          const next = Number(event.currentTarget.value);
          // A half-typed "-" parses as NaN; keeping the previous value stops
          // the field fighting the user mid-edit.
          onChange(Number.isFinite(next) ? next : value);
        }}
        className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-900 font-semibold focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      {suffix && <span className="text-[11px] font-bold text-slate-400 shrink-0">{suffix}</span>}
    </div>
    {hint && <span className="text-[10px] text-slate-400 leading-tight block mt-1">{hint}</span>}
  </label>
);

const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <label className="block">
    <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">{label}</span>
    <input
      value={value}
      placeholder={placeholder}
      onChange={event => onChange(event.currentTarget.value)}
      className="w-full mt-1 bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
    />
  </label>
);

const Toggle: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }> = ({
  label,
  value,
  onChange,
  hint,
}) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className={`flex items-start gap-2.5 text-left px-3 py-2 rounded-lg border transition-colors ${
      value ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:border-slate-300'
    }`}
  >
    <span
      className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
        value ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
      }`}
    >
      {value && <Check className="w-3 h-3 text-white" strokeWidth={4} />}
    </span>
    <span>
      <span className="text-[11px] font-black text-slate-700 block">{label}</span>
      {hint && <span className="text-[10px] text-slate-400 leading-tight block">{hint}</span>}
    </span>
  </button>
);

const SectionTitle: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="mb-4">
    <h3 className="text-sm font-black text-slate-900 tracking-tight">{title}</h3>
    <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{description}</p>
  </div>
);

/** A blank condition, for the "add" button. */
const newCondition = (): MedicalConditionConfig => ({
  id: '',
  title: '',
  description: '',
  enabled: true,
  targetAdjustmentMl: 0,
  recoveryMultiplier: 1,
  absorptionEfficiency: 1,
  riskWeightDeltas: {},
  riskLoadMultipliers: {},
  pbwrAdjustmentMl: 0,
  pbwrUpperLimitMl: null,
  requiresPhysicianLimit: false,
});

const AppConfigPage: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [version, setVersion] = useState(0);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stored = await AppConfigAdminService.fetchConfig();
      setConfig(stored.config);
      setVersion(stored.version);
      setIsDefault(stored.isDefault);
      setDirty(false);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load the configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const edit = (mutate: (draft: AppConfig) => AppConfig) => {
    setConfig(previous => (previous ? mutate(structuredClone(previous)) : previous));
    setDirty(true);
    setSavedAt(null);
  };

  const save = async () => {
    if (!config) return;

    // Ids are the join between this document and every stored profile, so a
    // blank or duplicated one silently detaches a diagnosis from its effects.
    // Catching it here beats discovering it on a user's dashboard.
    const ids = config.medicalConditions.map(condition => condition.id.trim());
    if (ids.some(id => !id)) {
      setError('Every condition needs an id. It is what profiles store.');
      return;
    }
    if (new Set(ids).size !== ids.length) {
      setError('Two conditions share an id. Ids must be unique.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await AppConfigAdminService.saveConfig(config);
      await load();
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err?.message ?? 'Could not save the configuration.');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    if (!window.confirm('Clear every override and put all installs back on the shipped defaults?')) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await AppConfigAdminService.resetConfig();
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not reset the configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-xs font-black tracking-widest text-slate-400">
        LOADING APP CONFIGURATION...
      </div>
    );
  }

  if (!config) {
    return (
      <GlassCard className="border-red-200 bg-red-50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
          <div>
            <p className="text-sm font-black text-red-700">Configuration unavailable</p>
            <p className="text-[11px] text-red-600 mt-1">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={load}>
              Try again
            </Button>
          </div>
        </div>
      </GlassCard>
    );
  }

  const updateCondition = (index: number, patch: Partial<MedicalConditionConfig>) =>
    edit(draft => {
      draft.medicalConditions[index] = { ...draft.medicalConditions[index], ...patch };
      return draft;
    });

  const updateActivity = (index: number, patch: Partial<ActivityLevelConfig>) =>
    edit(draft => {
      draft.activityLevels[index] = { ...draft.activityLevels[index], ...patch };
      return draft;
    });

  const updateWorkEnv = (index: number, patch: Partial<WorkEnvironmentConfig>) =>
    edit(draft => {
      draft.workEnvironments[index] = { ...draft.workEnvironments[index], ...patch };
      return draft;
    });

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <GlassCard className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">App Configuration</h2>
          <p className="text-[11px] text-slate-500 mt-1 max-w-2xl leading-snug">
            What every installed app reads at launch. Changes reach devices on their next
            foreground — no release. Version {version}
            {isDefault && ' · currently running the shipped defaults'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-[11px] font-black text-emerald-600">Saved at {savedAt}</span>
          )}
          <Button variant="ghost" size="sm" onClick={resetToDefaults} disabled={saving}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reset to defaults
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? 'Publishing…' : dirty ? 'Publish changes' : 'No changes'}
          </Button>
        </div>
      </GlassCard>

      {error && (
        <GlassCard className="border-red-200 bg-red-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-[12px] text-red-700 font-semibold">{error}</p>
          </div>
        </GlassCard>
      )}

      {/* Conditions */}
      <GlassCard>
        <SectionTitle
          title="Medical conditions"
          description="The list onboarding and the profile editor show, and every number the app derives from a diagnosis. The id is what profiles store — change a title freely, but retire an id rather than renaming it."
        />

        <div className="space-y-4">
          {config.medicalConditions.map((condition, index) => (
            <div
              key={index}
              className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-4"
            >
              <div className="grid gap-3 md:grid-cols-[160px_1fr_auto] items-start">
                <TextField
                  label="Id (stored on profiles)"
                  value={condition.id}
                  onChange={id => updateCondition(index, { id })}
                  placeholder="e.g. ckd"
                />
                <TextField
                  label="Title"
                  value={condition.title}
                  onChange={title => updateCondition(index, { title })}
                />
                <button
                  type="button"
                  onClick={() =>
                    edit(draft => {
                      draft.medicalConditions.splice(index, 1);
                      return draft;
                    })
                  }
                  title="Remove this condition"
                  className="mt-5 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <TextField
                label="Description shown to the user"
                value={condition.description}
                onChange={description => updateCondition(index, { description })}
              />

              <div className="grid gap-3 md:grid-cols-3">
                <NumberField
                  label="Daily goal adjustment"
                  suffix="ml"
                  step={25}
                  value={condition.targetAdjustmentMl}
                  onChange={targetAdjustmentMl => updateCondition(index, { targetAdjustmentMl })}
                  hint="Negative lowers the goal."
                />
                <NumberField
                  label="PBWR adjustment"
                  suffix="ml"
                  step={25}
                  value={condition.pbwrAdjustmentMl}
                  onChange={pbwrAdjustmentMl => updateCondition(index, { pbwrAdjustmentMl })}
                />
                <NumberField
                  label="PBWR ceiling (0 = none)"
                  suffix="ml"
                  step={100}
                  value={condition.pbwrUpperLimitMl ?? 0}
                  onChange={value =>
                    updateCondition(index, { pbwrUpperLimitMl: value > 0 ? value : null })
                  }
                />
                <NumberField
                  label="Recovery multiplier"
                  step={0.05}
                  value={condition.recoveryMultiplier}
                  onChange={recoveryMultiplier => updateCondition(index, { recoveryMultiplier })}
                  hint="Above 1 means recovery takes longer."
                />
                <NumberField
                  label="Absorption efficiency"
                  step={0.05}
                  value={condition.absorptionEfficiency}
                  onChange={absorptionEfficiency => updateCondition(index, { absorptionEfficiency })}
                  hint="Below 1 means a drink lowers risk less."
                />
                <div className="flex flex-col gap-2 justify-end">
                  <Toggle
                    label="Offer in the app"
                    value={condition.enabled}
                    onChange={enabled => updateCondition(index, { enabled })}
                  />
                  <Toggle
                    label="Needs a physician's limit"
                    hint="The app will not pace intake without one."
                    value={condition.requiresPhysicianLimit}
                    onChange={requiresPhysicianLimit =>
                      updateCondition(index, { requiresPhysicianLimit })
                    }
                  />
                </div>
              </div>

              {/* Risk-engine tweaks */}
              <div>
                <p className="text-[10px] uppercase font-black text-slate-500 tracking-wider mb-2">
                  Risk engine
                </p>
                <div className="grid gap-3 md:grid-cols-5">
                  {(['heart', 'activity', 'temp', 'humidity', 'time'] as const).map(channel => (
                    <div key={channel} className="space-y-2">
                      <NumberField
                        label={`${channel} weight Δ`}
                        step={0.01}
                        value={condition.riskWeightDeltas?.[channel] ?? 0}
                        onChange={value =>
                          updateCondition(index, {
                            riskWeightDeltas: { ...condition.riskWeightDeltas, [channel]: value },
                          })
                        }
                      />
                      <NumberField
                        label={`${channel} load ×`}
                        step={0.05}
                        value={condition.riskLoadMultipliers?.[channel] ?? 1}
                        onChange={value =>
                          updateCondition(index, {
                            riskLoadMultipliers: {
                              ...condition.riskLoadMultipliers,
                              [channel]: value,
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() =>
            edit(draft => {
              draft.medicalConditions.push(newCondition());
              return draft;
            })
          }
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add condition
        </Button>
      </GlassCard>

      {/* Goal formula */}
      <GlassCard>
        <SectionTitle
          title="Daily goal formula"
          description="Body weight sets the baseline; activity, conditions and climate move it; the range is the safety clamp that no combination can escape."
        />
        <div className="grid gap-3 md:grid-cols-4">
          <NumberField
            label="Millilitres per kg"
            value={config.targetFormula.mlPerKg}
            onChange={mlPerKg =>
              edit(draft => {
                draft.targetFormula.mlPerKg = mlPerKg;
                return draft;
              })
            }
          />
          <NumberField
            label="Minimum goal"
            suffix="ml"
            step={50}
            value={config.targetFormula.minTargetMl}
            onChange={minTargetMl =>
              edit(draft => {
                draft.targetFormula.minTargetMl = minTargetMl;
                return draft;
              })
            }
          />
          <NumberField
            label="Maximum goal"
            suffix="ml"
            step={50}
            value={config.targetFormula.maxTargetMl}
            onChange={maxTargetMl =>
              edit(draft => {
                draft.targetFormula.maxTargetMl = maxTargetMl;
                return draft;
              })
            }
          />
          <NumberField
            label="Round to"
            suffix="ml"
            step={10}
            value={config.targetFormula.roundToMl}
            onChange={roundToMl =>
              edit(draft => {
                draft.targetFormula.roundToMl = roundToMl;
                return draft;
              })
            }
          />
        </div>
      </GlassCard>

      {/* Activity levels */}
      <GlassCard>
        <SectionTitle
          title="Activity levels"
          description="The strain options onboarding offers, and what each adds to the daily goal."
        />
        <div className="space-y-3">
          {config.activityLevels.map((level, index) => (
            <div key={level.id} className="grid gap-3 md:grid-cols-[140px_1fr_160px_160px] items-end">
              <TextField label="Id" value={level.id} onChange={id => updateActivity(index, { id })} />
              <TextField
                label="Title"
                value={level.title}
                onChange={title => updateActivity(index, { title })}
              />
              <NumberField
                label="Goal bonus"
                suffix="ml"
                step={50}
                value={level.targetBonusMl}
                onChange={targetBonusMl => updateActivity(index, { targetBonusMl })}
              />
              <Toggle
                label="Offer in the app"
                value={level.enabled}
                onChange={enabled => updateActivity(index, { enabled })}
              />
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Work environments */}
      <GlassCard>
        <SectionTitle
          title="Work environments"
          description="Where the user spends the day, and what it adds to the PBWR baseline."
        />
        <div className="space-y-3">
          {config.workEnvironments.map((env, index) => (
            <div key={env.id} className="grid gap-3 md:grid-cols-[140px_1fr_160px_160px] items-end">
              <TextField label="Id" value={env.id} onChange={id => updateWorkEnv(index, { id })} />
              <TextField
                label="Label"
                value={env.label}
                onChange={label => updateWorkEnv(index, { label })}
              />
              <NumberField
                label="PBWR adjustment"
                suffix="ml"
                step={50}
                value={env.pbwrAdjustmentMl}
                onChange={pbwrAdjustmentMl => updateWorkEnv(index, { pbwrAdjustmentMl })}
              />
              <Toggle
                label="Offer in the app"
                value={env.enabled}
                onChange={enabled => updateWorkEnv(index, { enabled })}
              />
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Climate bands */}
      <GlassCard>
        <SectionTitle
          title="Climate bands"
          description="The user's city is resolved from their device's location, then matched against these lists. The last band, with no cities, is the catch-all."
        />
        <div className="space-y-4">
          {config.climateBands.map((band, index) => (
            <div key={band.id} className="grid gap-3 md:grid-cols-[140px_1fr_150px_150px] items-start">
              <TextField
                label="Label"
                value={band.label}
                onChange={label =>
                  edit(draft => {
                    draft.climateBands[index].label = label;
                    return draft;
                  })
                }
              />
              <TextField
                label="Cities (comma separated)"
                value={band.cities.join(', ')}
                onChange={value =>
                  edit(draft => {
                    draft.climateBands[index].cities = value
                      .split(',')
                      .map(city => city.trim())
                      .filter(Boolean);
                    return draft;
                  })
                }
              />
              <NumberField
                label="Goal adjustment"
                suffix="ml"
                step={25}
                value={band.targetAdjustmentMl}
                onChange={targetAdjustmentMl =>
                  edit(draft => {
                    draft.climateBands[index].targetAdjustmentMl = targetAdjustmentMl;
                    return draft;
                  })
                }
              />
              <NumberField
                label="Heat load ×"
                step={0.05}
                value={band.riskLoadMultiplier}
                onChange={riskLoadMultiplier =>
                  edit(draft => {
                    draft.climateBands[index].riskLoadMultiplier = riskLoadMultiplier;
                    return draft;
                  })
                }
              />
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Quick log amounts */}
      <GlassCard>
        <SectionTitle
          title="Quick-log amounts"
          description="The one-tap amounts on the dashboard, in the log sheet and in Vari's quick replies. All three read this list."
        />
        <div className="space-y-3">
          {config.quickLogAmounts.map((amount, index) => (
            <div key={index} className="grid gap-3 md:grid-cols-[1fr_160px_180px_auto] items-end">
              <TextField
                label="Label"
                value={amount.label}
                onChange={label =>
                  edit(draft => {
                    draft.quickLogAmounts[index].label = label;
                    return draft;
                  })
                }
              />
              <NumberField
                label="Amount"
                suffix="ml"
                step={50}
                value={amount.ml}
                onChange={ml =>
                  edit(draft => {
                    draft.quickLogAmounts[index].ml = ml;
                    return draft;
                  })
                }
              />
              <Toggle
                label="Highlight as the common choice"
                value={amount.primary}
                onChange={primary =>
                  edit(draft => {
                    draft.quickLogAmounts = draft.quickLogAmounts.map((entry, i) => ({
                      ...entry,
                      // Exactly one amount is the suggested one.
                      primary: i === index ? primary : false,
                    }));
                    return draft;
                  })
                }
              />
              <button
                type="button"
                onClick={() =>
                  edit(draft => {
                    draft.quickLogAmounts.splice(index, 1);
                    return draft;
                  })
                }
                title="Remove this amount"
                className="p-2 mb-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() =>
            edit(draft => {
              draft.quickLogAmounts.push({ label: '300 ml', ml: 300, primary: false });
              return draft;
            })
          }
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add amount
        </Button>
      </GlassCard>

      {/* Feature switches */}
      <GlassCard>
        <SectionTitle
          title="Unfinished features"
          description="Anything named here is hidden in the app, or labelled as in development where hiding it would leave a hole. Use it to switch off a control before it can ship as one that does nothing."
        />
        <TextField
          label="Disabled feature keys (comma separated)"
          value={config.disabledFeatures.join(', ')}
          onChange={value =>
            edit(draft => {
              draft.disabledFeatures = value
                .split(',')
                .map(key => key.trim())
                .filter(Boolean);
              return draft;
            })
          }
        />
      </GlassCard>
    </div>
  );
};

export default AppConfigPage;
