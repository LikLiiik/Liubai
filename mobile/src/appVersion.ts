import Constants from 'expo-constants';
import config from '../app.json';

export const appVersion = Constants.expoConfig?.version ?? config.expo.version;
export const androidBuild = Constants.expoConfig?.android?.versionCode;
