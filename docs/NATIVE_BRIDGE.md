# Native Health Bridge (Health Connect / HealthKit)

Google **Health Connect** (Android) und Apple **HealthKit** (iOS) sind Schnittstellen auf dem Gerät, die
ausschließlich nativen Apps zur Verfügung stehen. Eine Web-App/PWA hat darauf technisch keinen Zugriff.
heben enthält daher eine fertige Erweiterungsschnittstelle: Wird die App in eine native Hülle verpackt
(empfohlen: [Capacitor](https://capacitorjs.com)), muss diese nur das Objekt `window.ForgeHealthBridge`
bereitstellen. Die Web-App erkennt es automatisch (Mehr → Datenquellen → „Health Connect / HealthKit“)
und synchronisiert darüber wie über jede andere Quelle: mit Zustimmung pro Kategorie, Dedupe,
Quellen-Priorität, Status und Löschfunktion.

Vertrag: `src/health/bridge.ts`

```ts
interface ForgeHealthBridge {
  platform: 'healthconnect' | 'healthkit';
  version?: string;
  isAvailable(): Promise<boolean>;
  requestPermissions(categories: ('activity'|'body')[]): Promise<HealthCategory[]>; // granted
  read(p: { from: 'YYYY-MM-DD'; to: 'YYYY-MM-DD'; categories: HealthCategory[] }): Promise<{
    metrics: { metric: MetricKey; date: string; value: number; origin?: string }[]; // 1 Wert pro Tag & Metrik
  }>;
}
```

Einheiten (müssen nativ umgerechnet werden): Schritte = Anzahl, `distance_m` = Meter, Energie = kcal
(`active_kcal` nur Bewegung, `basal_kcal` Ruheenergie, `total_kcal` = beides – nie addieren),
`weight_kg` = kg, `body_fat_pct` = Prozent (0–100).

## Android – Health Connect

* Abhängigkeit: `androidx.health.connect:connect-client`
* Records → Metriken: `StepsRecord`→steps, `DistanceRecord`→distance_m, `FloorsClimbedRecord`→floors,
  `ActiveCaloriesBurnedRecord`→active_kcal, `BasalMetabolicRateRecord`/`TotalCaloriesBurnedRecord`,
  `WeightRecord`, `BodyFatRecord`.
* Für Tagessummen `aggregateGroupByPeriod` verwenden (Health Connect entfernt Doppelzählungen zwischen Apps).
* Manifest: die jeweiligen `android.permission.health.READ_*`-Berechtigungen, eine Activity für
  `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` mit Datenschutzerklärung, `<queries>` für das
  Health-Connect-Paket. Für den Play Store ist die Health-Connect-Deklaration in der Play Console nötig.
* Daten der **Fitbit Air** landen in Health Connect, wenn in der Google-Health-App die Health-Connect-Freigabe aktiv ist.

## iOS – HealthKit

* Capability „HealthKit“, `NSHealthShareUsageDescription` in Info.plist.
* Typen: `stepCount`, `distanceWalkingRunning`, `flightsClimbed`, `activeEnergyBurned`, `basalEnergyBurned`,
  `appleExerciseTime`, `bodyMass`, `bodyFatPercentage`.
* Tagessummen mit `HKStatisticsCollectionQuery` (`.cumulativeSum`, dedupliziert Quellen automatisch).
* Apple-Entwicklerkonto (99 €/Jahr) und Xcode/Mac zum Bauen erforderlich.

Ohne native Hülle bietet heben den Apple-Health-Export (Datei-Import) und die manuelle Eingabe.
