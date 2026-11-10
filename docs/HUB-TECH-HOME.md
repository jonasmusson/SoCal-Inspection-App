# HUB technician home — mobile contract

The technician home screen should be driven by one assignment-scoped backend response rather than making the shop phone assemble management data from many endpoints.

## Primary state

Show, in this order:

1. **Clocked In / Clocked Out**
2. **Current Work**
   - active project work session
   - current task
   - Stop Work
3. **Next**
   - assigned To Do / In Progress work
4. **Ready to Claim**
   - only unassigned To Do tasks on vehicles already assigned to the technician
   - only tasks matching an explicit capability code
   - supervised L2S tasks must already have a supervisor
5. **Blocked / Waiting**
6. **Open Parts Requests**
7. **Pending work entries**

## Need Work

If the technician has:
- no active work session;
- no assigned next task; and
- no eligible Ready-to-Claim task;

the response returns `need_work: true`.

The UI can turn that into a clear **Need Work** state for the morning/production workflow instead of letting cleaning or organizing become the default.

## Claim Task safety

Claiming is not free-form self-dispatch.

A technician may claim a task only when:
- the task is unassigned;
- task status is To Do;
- the vehicle is assigned to that technician;
- the technician has that exact capability code;
- L2S supervised work already has a supervisor;
- the task has not changed since it was loaded.

The update uses optimistic concurrency so two phones cannot both claim the same task.

## Privacy boundary

Tech Home must not return:
- customer contact information;
- compensation/pay-rate data;
- shop financials;
- management productivity totals;
- Shopmonkey write controls;
- unrelated vehicles/projects.

The tech needs enough context to do the work, document it and ask for help—nothing more.
