import path from 'path'
// import NuxtConfiguration from '@nuxt/config'
import StylelintPlugin from 'stylelint-webpack-plugin'

import Fiber from 'fibers'
import Sass from 'sass'

const scss = {
  implementation: Sass,
  sassOptions: {
    fiber: Fiber,
  },
}

module.exports = {
  target: 'static',

  buildModules: [
    '@nuxt/typescript-build',
    '@aceforth/nuxt-optimized-images',
    '@nuxtjs/style-resources',
  ],

  typescript: {
    typeCheck: true,
  },

  /**
   * https://marquez.co/docs/nuxt-optimized-images/
   */
  optimizedImages: {
    optimizeImages: true,
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
    link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
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
    '~plugins/dat.client',
    '~plugins/splitting.client',
    '~plugins/locomotive.client',
    '~plugins/composition-api',
    {
      src: '~plugins/exStore',
      ssr: true,
    },
  ],

  /*
   ** Nuxt.js modules
   */
  modules: [
    '@nuxtjs/pwa',
    'nuxt-user-agent',
    'nuxt-webfontloader',
    '@nuxtjs/google-gtag',
  ],

  'google-gtag': {
    id: 'G-1RJ1F2HNG8',
    config: {
      send_page_view: false, // might be necessary to avoid duplicated page track on page reload
    },
    debug: false, // use dev mode
  },

  /**
   * global scss variables and functions
   */
  styleResources: {
    scss: [
      '~/assets/sass/foundation/variable/_variable.scss',
      '~/assets/sass/foundation/mixin/_mixin.scss',
    ],
  },

  /**
   * global webfonts
   */
  webfontloader: {
    custom: {
      urls: [
        'https://fonts.googleapis.com/css2?family=Molle:ital@1&display=swap',
        'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap',
      ],
    },
  },

  /*
   ** Build configuration
   */
  build: {
    loaders: {
      scss,
    },

    terser: {
      terserOptions: {
        // disable console on prod
        compress: { drop_console: true },
      },
    },

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
    exclude: [/^(?=.*\bmixins\b).*$/],
  },
}
