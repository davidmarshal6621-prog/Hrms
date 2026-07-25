import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import branchesRouter from "./branches";
import departmentsRouter from "./departments";
import shiftsRouter from "./shifts";
import employeesRouter from "./employees";
import attendanceRouter from "./attendance";
import leavesRouter from "./leaves";
import payrollRouter from "./payroll";
import dashboardRouter from "./dashboard";
import devicesRouter from "./devices";
import reportsRouter from "./reports";
import companySettingsRouter from "./company-settings";
import punchLogsRouter from "./punch-logs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(branchesRouter);
router.use(departmentsRouter);
router.use(shiftsRouter);
router.use(employeesRouter);
router.use(attendanceRouter);
router.use(leavesRouter);
router.use(payrollRouter);
router.use(dashboardRouter);
router.use(devicesRouter);
router.use(reportsRouter);
router.use(companySettingsRouter);
router.use(punchLogsRouter);

export default router;
