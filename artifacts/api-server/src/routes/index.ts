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

export default router;
