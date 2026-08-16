# @omac/cli

OMAC Runtime Engine for the Oh My Algo Coach local coaching loop.

The package requires Node.js 22 or newer and is designed to run inside a
project-local `.omac` Workspace. It does not create global state.

```bash
omac init --learner-id alice
omac event list
omac doctor
```

`omac init` also synchronizes the bundled OMAC Skill into the current
repository's `.agents/skill/omac/` directory. Skills are never installed into
global Agent directories.

See the project documentation at
https://github.com/brofea/oh-my-algo-coach for the full coaching protocol.
