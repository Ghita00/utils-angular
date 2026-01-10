# utils-angular
some Node script to help me with Angular development, to use as a CLI

# setup
create .env file with this configuration

``` 
############# GENERAL SETTINGS ############
projectPath= #string: path to the Angular project

############# checkInfoProject ############
showInstalledVersions= #bool: show installed versions vs package.json
checkOutdated= #bool: check for outdated packages
groupByCategory= #bool: group packages by category

############# checkUselessCss ############
ignore_angularMaterial= #bool: ignore classes -> cmat-, cdk-, mdc-
ignore_agGrid= #bool: ignore classes -> ag-, ag-theme-
ignore_bootstrap= #bool: ignore classes -> btn-, col-, row-, etc.
verbose_css= #bool: also show components without unused classes

############# checkUselessImport ############
ignoreDecorators= #bool: consider decorators (@Component, @Injectable, etc.)
ignoreTypes= #bool: consider type hints (: MyType, <MyType>)
verbose_import= #bool: extended logging or not

############# clearAngular ############
dryRun= #bool: only show what would be deleted
confirmBeforeDelete= #bool: ask for confirmation before deleting
```

# how to use
1. open terminal
2. move to project folder
3. use "node main.js" and enjoi