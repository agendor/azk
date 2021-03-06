# azk [![Gitter](https://badges.gitter.im/Join Chat.svg)](https://gitter.im/azukiapp/azk?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge) [![Code Climate](https://codeclimate.com/github/azukiapp/azk/badges/gpa.svg)](https://codeclimate.com/github/azukiapp/azk)  

### A development environment orchestration tool

`azk` lets developers easily and quickly install and configure their development environments. Period.

![Usage of azk](https://github.com/azukiapp/azk/blob/master/src/pres/azk-screenflow-slow.gif?raw=true)

## Quick start

### Installing

```
$ curl -Ls http://azk.io/install.sh | bash
```

Requirements:

* **Mac OS X:** [VirtualBox](https://www.virtualbox.org/), version 4.3.6+
* **Linux:** [Docker][docker], version 1.2+

For further details, please see the [docs](http://docs.azk.io/en/installation/index.html).

### Using `azk`

#### Starting a new project

If you are starting a new application project, you can already use `azk` to obtain the proper runtime as well the corresponding generators for your chosen language and then generate the application's basic structure. An example in Node.js would look like this:

```bash
$ cd ~/projects
$ azk shell --image azukiapp/node # obtaining the runtime
    # mkdir app-name
    # npm init                    # building the application's basic structure
    ...
    # exit
$ cd app-name
$ azk init
azk: `node` system was detected at 'app-name'
azk: 'Azkfile.js' generated

$ azk start
```

#### Using `azk` with an existing project

When you have an application project that's already started, and want to use `azk` to streamline its development environment, all you have to do is:

```bash
$ cd [my_application_folder]
$ azk init
azk: 'Azkfile.js' generated
...
$ azk start
```

## Main features

* Multiplatform: Works both on Linux & Mac OS X (requires 64-bit platform);
  * Windows planned. Want azk to run in Windows? Thumbs up here: https://github.com/azukiapp/azk/issues/334
* Images: via [azk images][azk_images], [Docker Registry][docker_registry] or run your own Dockerfile;
* Built-in load-balancer;
* Built-in file sync;
* Automatic start-up (and reload) script;
* Logging;
* And simple and easy to use DSL to describe systems architecture;

## Documentation

You can find our documentation online at: http://docs.azk.io/

### Basic Vocabulary

#### System of Systems

`azk` is based on the concept of [System of Systems][sos]. Accordingly, applications (your code), services and workers (such as databases, webservers and queue systems) are treated as systems that communicate with each other and together make the primary system. Using this paradigm, `azk` installs and manages development environments. While this may seem overkill at first, it actually makes it a lot easier to manage the development and execution environments of an application (in its parts - the "systems" - or in its entirety - the full "system of systems").

#### Images

In order to automate the provisioning of development environments, `azk` uses pre-built custom images. These images follow the [Docker][docker] standard and can be found in: [azk images][azk_images], [Docker Index][docker_hub] or [Dockerfile][dockerfile].

#### Azkfile.js

`Azkfile.js` files are the cornerstone of how to use `azk`. These simple manifest files describe the systems that make your system of systems as well as the images used in their execution. They also describe parameters and execution options.

More information [here](http://docs.azk.io/en/azkfilejs/README.html).

## Contributions

Check our [Contributing Guide](CONTRIBUTING.md) for instructions on how to help the project!

Share the love and star us here in Github!

## License

"Azuki", "azk" and the Azuki logo are copyright (c) 2013-2015 Azuki Serviços de Internet LTDA.

**azk** source code is released under Apache 2 License.

Check LEGAL and LICENSE files for more information.

[sos]: http://en.wikipedia.org/wiki/System_of_systems
[docker]: http://docker.io
[azk_images]: http://images.azk.io
[docker_hub]: https://registry.hub.docker.com/
[dockerfile]: http://dockerfile.github.io
[docker_registry]: http://registry.hub.docker.com
