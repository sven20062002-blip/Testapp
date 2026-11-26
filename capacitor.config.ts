import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.heben.fitness',
  appName: 'heben',
  webDir: 'dist',
  backgroundColor: '#F6F6F8',
  ios: { contentInset: 'never', backgroundColor: '#F6F6F8' },
  android: { backgroundColor: '#F6F6F8' },
};

export default config;
