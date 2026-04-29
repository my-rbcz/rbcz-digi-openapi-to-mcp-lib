# rbcz-digi-mock-mch

Simple MCH backend mock

## what it does

* It mocks following operations:
  * GET /clients
  * GET /user/info
  * GET /contacts
  * POST /catalogs/bulk
* It has simple structure
  * fixtures in folders per mocked api
  * for every API 2 or 3 different fixtures simulating different responses
* It has simple and flat structure so thas we can embrace later into lib as example
* It has ideally no dependencies at all, use node.js primitives to build http server
* Code is as simple as possible since it will be used as example in library
* Which fixture will be returned must be determined based on input data