import path from 'path'
// import NuxtConfiguration from '@nuxt/config'
import StylelintPlugin from 'stylelint-webpack-plugin'

module.exports = {
  mode: 'universal',

  buildModules: ['@nuxt/typescript-build'],

  typescript: {
    typeCheck: true,
  },

  /*
   ** Headers of the page
   */
  head: {
    title: 'laboobal dev',
    htmlAttrs: {
      lang: 'ja',
    },
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'description', name: 'description', content: 'laboobal dev' },
    ],
    link: [
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css?family=Molle:400i&display=swap',
      },
    ],
    script: [
      {
        src:
          'https://cdn.polyfill.io/v2/polyfill.js?features=IntersectionObserver,es6,es7',
        type: 'text/javascript',
      },
    ],
  },

  /*
   ** Customize the progress-bar color
   */
  loading: { color: '#fff' },

  /*
   ** Global CSS
   */
  css: ['locomotive-scroll/dist/locomotive-scroll.min.css'],

  /*
   ** Plugins to load before mounting the App
   */
  plugins: [
    '~plugins/vue-lazyload.client.js',
    '~plugins/dat.client.ts',
    '~plugins/splitting.client.ts',
    '~plugins/locomotive.client.ts',
    '~/plugins/composition-api',
    {
      src: '~plugins/exStore',
      ssr: true,
    },
  ],

  /*
   ** Nuxt.js modules
   */
  modules: [
    '@nuxtjs/style-resources',
    '@nuxtjs/pwa',
    'nuxt-user-agent',
    '@bazzite/nuxt-optimized-images',
  ],

  styleResources: {
    scss: [
      '~/assets/sass/foundation/variable/_variable.scss',
      '~/assets/sass/foundation/mixin/_mixin.scss',
    ],
  },

  optimizedImages: {
    optimizeImages: true,
  },

  /*
   ** Build configuration
   */
  build: {
    /*
     ** You can extend webpack config here
     */
    extend(config, { isClient, isDev }) {
      // Run ESLint on save
      if (isDev && isClient) {
        config.module.rules.push({
          enforce: 'pre',
          test: /\.(js|vue)$/,
          loader: 'eslint-loader',
          exclude: /(node_modules)/,
        })

        config.plugins.push(
          new StylelintPlugin({
            files: ['**/*.vue'],
          }),
        )

        config.devtool = '#source-map'
      }

      config.module.rules.push({
        test: /\.(glsl|vs|fs)$/,
        use: ['raw-loader', 'glslify-loader'],
        exclude: /(node_modules)/,
      })

      // import alias
      config.resolve.alias.Sass = path.resolve(__dirname, './assets/sass/')
      config.resolve.alias.Js = path.resolve(__dirname, './assets/js/')
      config.resolve.alias.Images = path.resolve(__dirname, './assets/images/')
      config.resolve.alias['~'] = path.resolve(__dirname)
      config.resolve.alias['@'] = path.resolve(__dirname)
    },
  },

  generate: {
    exclude: ['/mixins'],
  },
}
