import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { completeGuide, createGuideWriter, deferGuide, freshGuideProgress, guideStartStep, parseGuideProgress, shouldShowGuide, visitGuideStep, type GuideProgress, type GuideStepId } from './guide';
import { guideStorage } from './storage';

type GuideState = {
  ready: boolean; visible: boolean; progress: GuideProgress; saveError: boolean;
  open: (stepId?: GuideStepId) => void; visit: (stepId: GuideStepId) => void;
  dismiss: () => void; finish: () => void; retry: () => void;
};
const Context = createContext<GuideState | null>(null);
export function GuideProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false), [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(freshGuideProgress), [saveError, setSaveError] = useState(false);
  const latest = useRef(progress), alive = useRef(true), writeVersion = useRef(0);
  const writer = useRef(createGuideWriter(guideStorage.set));
  useEffect(() => {
    alive.current = true;
    void guideStorage.get().then(raw => {
      if (!alive.current) return;
      const loaded = parseGuideProgress(raw);
      latest.current = visitGuideStep(loaded, guideStartStep(loaded));
      setProgress(latest.current); setVisible(shouldShowGuide(loaded));
    }).catch(() => { if (alive.current) { setSaveError(true); setVisible(true); } })
      .finally(() => { if (alive.current) setReady(true); });
    return () => { alive.current = false; };
  }, []);
  const persist = useCallback((next: GuideProgress) => {
    latest.current = next; setProgress(next);
    const version = ++writeVersion.current;
    void writer.current(next).then(() => { if (alive.current && version === writeVersion.current) setSaveError(false); })
      .catch(() => { if (alive.current && version === writeVersion.current) setSaveError(true); });
  }, []);
  const open = useCallback((stepId?: GuideStepId) => {
    if (!ready) return;
    persist(visitGuideStep(latest.current, stepId ?? guideStartStep(latest.current))); setVisible(true);
  }, [persist, ready]);
  const visit = useCallback((stepId: GuideStepId) => persist(visitGuideStep(latest.current, stepId)), [persist]);
  const dismiss = useCallback(() => { persist(deferGuide(latest.current)); setVisible(false); }, [persist]);
  const finish = useCallback(() => { persist(completeGuide(latest.current)); setVisible(false); }, [persist]);
  const retry = useCallback(() => persist(latest.current), [persist]);
  return <Context.Provider value={{ ready, visible, progress, saveError, open, visit, dismiss, finish, retry }}>{children}</Context.Provider>;
}
export function useGuide() {
  const value = useContext(Context);
  if (!value) throw new Error('GuideProvider missing');
  return value;
}
