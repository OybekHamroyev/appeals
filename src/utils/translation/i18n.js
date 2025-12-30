import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import translationUz from './uz/translation.json';
import translationRu from './ru/translation.json';
import translationEn from './en/translation.json';

i18n.use(initReactI18next).init({
    resources: {
        uz: { translation: translationUz },
        ru: { translation: translationRu },
        en: { translation: translationEn },
    },
    lng: 'uz',
    fallbackLng: 'uz',
    interpolation: { escapeValue: false },
});

export default i18n;